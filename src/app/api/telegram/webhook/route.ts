import { NextResponse, NextRequest } from 'next/server';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';

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

Only return valid structured JSON. If no transaction can be found, return an empty array [].
`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;

  if (message.photo) {
    const fileId = message.photo.at(-1).file_id;

    // Step 1: Get Telegram file URL
    const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const fileData = await fileResp.json();
    const filePath = fileData.result?.file_path;
    const telegramFileURL = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${filePath}`;

    // Step 2: Send image to OpenAI Vision
    const parsed = await extractFromImage(telegramFileURL, chatId);

    if (parsed.success) {
      await sendTelegram(chatId, "✅ Your receipt is valid.");
    } else {
      await sendTelegram(chatId, "⚠️ Your receipt was not read, please resend it.");
    }

  } else if (message.text) {
    const parsed = await extractFromText(message.text, chatId);

    if (parsed.success) {
      await sendTelegram(chatId, "✅ Your receipt is valid.");
    } else {
      await sendTelegram(chatId, "⚠️ Your receipt was not read, please resend it.");
    }

  } else {
    await sendTelegram(chatId, "📷 No receipt detected.");
  }

  return NextResponse.json({ ok: true });
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

async function extractFromImage(imageUrl: string, chatId: number) {
  try {
    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
    const parsed = content ? extractJSON(content) : null;
    if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) return { success: false };

    const STORE_MAP: Record<number, string> = {
      123456789: 'store_001',
      987654321: 'store_002',
    };

    const storeId = STORE_MAP[chatId] || 'store_unknown';

    const data = (Array.isArray(parsed) ? parsed : [parsed]).map(d => ({
      ...d,
      store_id: storeId,
      source: 'telegram',
      date: d.date && d.date.trim() !== "" ? d.date : null,
    }));

    const { error } = await supabase.from('transactions').insert(data);
    if (error) {
      console.error("Insert error:", error);
      return { success: false };
    }

    return { success: true };

  } catch (err) {
    console.error("Image extraction failed:", err);
    return { success: false };
  }
}

// 🧠 Fallback for plain text
async function extractFromText(rawText: string, chatId: number) {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You extract deposit transactions from raw receipt text.' },
        { role: 'user', content: `${transactionPrompt}\n\n${rawText}` }
      ],
      temperature: 0.2
    });

    const content = res.choices[0].message.content?.trim();
    const parsed = content ? extractJSON(content) : null;
    if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) return { success: false };

    const data = Array.isArray(parsed) ? parsed : [parsed];
    const mappedData = data.map(d => ({
      ...d,
      source: 'telegram',
      date: d.date && d.date.trim() !== "" ? d.date : null,
    }));
    const { error } = await supabase.from('transactions').insert(mappedData);

    if (error) {
      console.error("Insert error:", error);
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    console.error("Text extraction failed:", err);
    return { success: false };
  }
}

// 📡 Send reply to Telegram
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
