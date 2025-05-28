import { NextResponse, NextRequest } from 'next/server';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import { formatInTimeZone } from 'date-fns-tz';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const transactionPrompt = `
Extract the money transaction and return this schema:

{
  store_id: string,
  type: "cash",
  amount: number,
  date: string,
  source: "telegram",
  reference: string,
  sender: string
}

Only return valid structured JSON. Some info might not be available in the receipt but as long as there is an amount, you have to return the json. then fill the rest of the avaiable. otherwise leave as unknown.
`;

// In-memory session store (cleared on server restart)
const sessions: Record<number, {
  data: any,
  missingFields: string[],
  lastActive: number,
  lastMissingField?: string
}> = {};

const REQUIRED_FIELDS = ['store_id', 'type', 'amount', 'date', 'source', 'reference', 'sender'];

function classifyCompletion(data: any): 'complete' | 'incomplete' | 'blank' {
  if (!data) return 'blank';
  const missing = REQUIRED_FIELDS.filter(f => !data[f] || data[f] === 'unknown' || data[f] === '');
  if (missing.length === 0) return 'complete';
  if (missing.length === REQUIRED_FIELDS.length) return 'blank';
  return 'incomplete';
}

function summarize(data: any): string {
  return REQUIRED_FIELDS.map(k => `${k}: ${data[k] ?? ''}`).join('\n');
}

function extractJSON(content: string): any | null {
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonString = codeBlockMatch ? codeBlockMatch[1] : content;

  try {
    return JSON.parse(jsonString);
  } catch {
    const curlyMatch = jsonString.match(/{[\s\S]*}/);
    const arrayMatch = jsonString.match(/\[[\s\S]*\]/);
    const match = curlyMatch || arrayMatch;
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return null;
  }
}

async function extractFromImage(imageUrl: string, chatId: number, message: any) {
  try {
    const result = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts structured transaction data from deposit slip images.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: transactionPrompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 1000,
    });

    const content = result.choices[0].message.content?.trim();
    let parsed = content ? extractJSON(content) : null;

    // Fallback: Try to extract a total amount if parsing failed or amount is missing
    if (
      !parsed ||
      (Array.isArray(parsed) && parsed.length === 0) ||
      (typeof parsed === "object" && parsed !== null && !parsed.amount)
    ) {
      const amountMatch = content?.match(/(?:total|amount)[^\d]{0,10}([\d,]+(?:\.\d{2})?)/i) ||
                          content?.match(/([\d,]+(?:\.\d{2})?)/);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : null;

      if (amount) {
        const sentDate = formatInTimeZone(
          new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000),
          'Asia/Manila',
          "yyyy-MM-dd"
        );

        return {
          data: {
            store_id: "store_unknown",
            type: "cash",
            amount,
            date: sentDate,
            source: "telegram",
            reference: "",
            sender: ""
          }
        };
      }
      return { data: null };
    }

    const STORE_MAP: Record<number, string> = {
      123456789: 'store_001',
      987654321: 'store_002',
    };
    const storeId = STORE_MAP[chatId] || 'store_unknown';
    const sentDate = formatInTimeZone(
      new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000),
      'Asia/Manila',
      "yyyy-MM-dd"
    );

    const d = Array.isArray(parsed) ? parsed[0] : parsed;
    return {
      data: {
        ...d,
        store_id: String(chatId),
        source: 'telegram',
        date: d.date && d.date.trim() !== "" ? d.date : sentDate,
      }
    };
  } catch (err) {
    console.error("Image extraction failed:", err);
    return { data: null };
  }
}

async function extractFromText(rawText: string, chatId: number, message: any) {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You extract deposit transactions from raw receipt text.' },
        { role: 'user', content: `${transactionPrompt}\n\n${rawText}` }
      ],
      temperature: 0.2
    });

    const content = res.choices[0].message.content?.trim();
    const parsed = content ? extractJSON(content) : null;
    if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) return { data: null };

    const sentDate = formatInTimeZone(
      new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000),
      'Asia/Manila',
      "yyyy-MM-dd"
    );

    const d = Array.isArray(parsed) ? parsed[0] : parsed;
    return {
      data: {
        ...d,
        source: 'telegram',
        date: d.date && d.date.trim() !== "" ? d.date : sentDate,
      }
    };
  } catch (err) {
    console.error("Text extraction failed:", err);
    return { data: null };
  }
}

async function sendTelegram(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}

async function handleConfirmationAI(
  userInput: string,
  sessionData: any,
  requiredFields: string[]
): Promise<{ action: 'confirm' | 'change' | 'missing', data: any, missingFields?: string[] }> {
  const prompt = `
You are an assistant helping users confirm or edit transaction data. 
Given the current data and the user's reply, return one of:
- If the user says "confirm" and all required fields are present, reply with: {"action":"confirm","data":{...}}
- If the user says "change field:value, ..." update the fields and reply with: {"action":"change","data":{...}}
- If after first sent, some required fields are missing or unknown, reply with: {"action":"missing","data":{...}, "missingFields":["field1", ...]}
- If after replying to a missing, some required fields are missing or unknown, reply with: {"action":"missing","data":{...}, "missingFields":["field1", ...]}

Required fields: ${requiredFields.join(', ')}
Current data: ${JSON.stringify(sessionData)}
User reply: ${userInput}
Respond ONLY with valid JSON as described above.
`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a strict JSON API.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0,
    max_tokens: 500,
  });

  const content = res.choices[0].message.content?.trim();
  return extractJSON(content ?? "");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;

  // Timeout check
  if (sessions[chatId] && Date.now() - sessions[chatId].lastActive > 5 * 60 * 1000) {
    delete sessions[chatId];
    await sendTelegram(chatId, "⏰ Your session has timed out, you will need to resend the image.");
    return NextResponse.json({ ok: true });
  }

  // If user is in a session and replying to a missing field or confirmation
  if (sessions[chatId] && message.text) {
    const session = sessions[chatId];
    const userInput = message.text.trim();

    // Fallback: If user replies with a value and there are missing fields, assign it to the first missing field
    if (
      session.missingFields?.length > 0 &&
      userInput &&
      !userInput.toLowerCase().startsWith('change') &&
      !userInput.toLowerCase().startsWith('confirm') &&
      userInput.toLowerCase() !== 'skip'
    ) {
      // Assign the reply to the first missing field
      const filledField = session.missingFields[0];
      session.data[filledField] = userInput;
      // Remove the filled field from missingFields
      session.missingFields = session.missingFields.slice(1);

      if (session.missingFields.length === 0) {
        await sendTelegram(chatId, `✅ Please confirm the details:\n${summarize(session.data)}\n\nReply 'confirm' to upload or 'change field:value, ...' to edit.`);
        session.lastActive = Date.now();
        session.lastMissingField = undefined;
        return NextResponse.json({ ok: true });
      } else {
        await sendTelegram(chatId, `Some fields are still missing. Please provide "${session.missingFields[0]}":`);
        session.lastActive = Date.now();
        session.lastMissingField = session.missingFields[0];
        return NextResponse.json({ ok: true });
      }
    }

    // Always process user input with AI to update session data
    const aiResult = await handleConfirmationAI(userInput, session.data, REQUIRED_FIELDS);

    if (aiResult.action === 'confirm') {
      const { error } = await supabase.from('transactions').insert([aiResult.data]);
      delete sessions[chatId];
      if (error) {
        await sendTelegram(chatId, "❌ Upload failed. Please try again.");
      } else {
        await sendTelegram(chatId, "🎉 Uploaded successfully!");
      }
      return NextResponse.json({ ok: true });
    } else if (aiResult.action === 'change') {
      session.data = aiResult.data;
      session.missingFields = REQUIRED_FIELDS.filter(f => !session.data[f] || session.data[f] === 'unknown' || session.data[f] === '');
      if (session.missingFields.length === 0) {
        await sendTelegram(chatId, `✅ Please confirm the details:\n${summarize(session.data)}\n\nReply 'confirm' to upload or 'change field:value, ...' to edit.`);
      } else {
        await sendTelegram(chatId, `Some fields are still missing. Please provide "${session.missingFields[0]}":`);
      }
      session.lastActive = Date.now();
      return NextResponse.json({ ok: true });
    } else if (aiResult.action === 'missing') {
      session.data = aiResult.data;
      session.missingFields = aiResult.missingFields || [];
      // Prevent infinite loop: if the same field is missing again, break and notify user
      if (
        session.missingFields.length === 1 &&
        session.lastMissingField === session.missingFields[0]
      ) {
        await sendTelegram(chatId, `⚠️ Still missing "${session.missingFields[0]}". Please check your input or type 'skip' to continue.`);
      } else {
        await sendTelegram(chatId, `Some fields are still missing. Please provide "${session.missingFields[0]}":`);
      }
      session.lastActive = Date.now();
      session.lastMissingField = session.missingFields[0];
      return NextResponse.json({ ok: true });
    }
  }

  // New image or text
  let parsed;
  if (message.photo) {
    const fileId = message.photo.at(-1).file_id;
    const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const fileData = await fileResp.json();
    const filePath = fileData.result?.file_path;
    const telegramFileURL = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${filePath}`;
    parsed = await extractFromImage(telegramFileURL, chatId, message);
  } else if (message.text) {
    parsed = await extractFromText(message.text, chatId, message);
  } else {
    await sendTelegram(chatId, "📷 No receipt detected.");
    return NextResponse.json({ ok: true });
  }

  // Classify and branch
  if (!parsed || !parsed.data) {
    await sendTelegram(chatId, "⚠️ Your receipt was not read, please resend it.");
    return NextResponse.json({ ok: true });
  }

  const completion = classifyCompletion(parsed.data);
  const baseData: any = {};
  for (const field of REQUIRED_FIELDS) {
    baseData[field] = parsed.data[field] ?? '';
  }
  if (completion === 'blank') {
    await sendTelegram(chatId, "⚠️ No valid data found, please resend the image.");
  } else if (completion === 'complete') {
    sessions[chatId] = { data: baseData, missingFields: [], lastActive: Date.now() };
    await sendTelegram(chatId, `✅ Please confirm the details:\n${summarize(baseData)}\n\nReply 'confirm' to upload or 'change field:value, ...' to edit.`);
  } else if (completion === 'incomplete') {
    const missingFields = REQUIRED_FIELDS.filter(f => !baseData[f] || baseData[f] === 'unknown' || baseData[f] === '');
    sessions[chatId] = { data: baseData, missingFields, lastActive: Date.now(), lastMissingField: missingFields[0] };
    await sendTelegram(chatId, `Some fields are missing. Please provide "${missingFields[0]}":`);
  }

  return NextResponse.json({ ok: true });
}
