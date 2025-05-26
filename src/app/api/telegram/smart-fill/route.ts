import { NextResponse, NextRequest } from 'next/server';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TODAY_UTC = new Date().toISOString().slice(0, 10) + "T00:00:00Z";

const transactionPrompt = `
System Prompt for Receipt Extraction from Image Text (Telegram)

- Speak in casual Filipino / taglish.
- Today's date is: ${TODAY_UTC} (UTC). Do not accept any "date" field after this.

Input Rules
- Input is the text extracted from an image of a receipt sent via Telegram.
- No additional image data will be sent; do not request images again.
- Text may be incomplete, messy, or ambiguous—use intelligent inference to fill missing fields.
- Always expect the fields to be extracted to match the schema below.

Output Schema (JSON)
{
  "type": "cash",
  "amount": "number",
  "date": "string (YYYY-MM-DDTHH:mm:ssZ, ISO 8601, must not be in the after ${TODAY_UTC})",
  "source": "telegram",
  "reference": "string",
  "created_at": "string (YYYY-MM-DDTHH:mm:ssZ, ISO 8601, can be left blank for backend to fill)",
  "deleted_at": "null or string (YYYY-MM-DDTHH:mm:ssZ, ISO 8601, null if not deleted)"
}

Data Validation Rules
- The "date" field must be formatted as YYYY-MM-DDTHH:mm:ssZ (ISO 8601, UTC) and must not be after ${TODAY_UTC}.
- The "type" field should always be "cash".
- The "source" field is always "telegram".
- "created_at" and "deleted_at" can be left blank or null for the backend to fill.
- All fields except "id", "created_at", and "deleted_at" are required and must not be empty.

Task Instructions
- Extract and fill all fields from the receipt text.
- Prioritize filling all fields—avoid missing values if you can infer them.
- When all fields are present, reply:
  Ito ang nabasa ko sa image: \n\n💵 type, \n💰 amount, \n📅 date, \n🔗 reference. \n\nKung ok na lahat, pwede na i-upload?.
- Always show all fields when confirming.
- Do not upload data before full user confirmation.
- If any fields are missing, reply like:
  "amount is missing, can you send the amount?"
- Ask for only one missing field at a time in a natural, friendly way.
- When all the fields are ready, show a summary of the receipt details and wait for the user to tell confirm that it's ready to upload.
- When showing the summary, indicate which fields you did not find in the image and have been smart-filled by you.
- When the user replies that they want to upload, reply exactly with:
- Your transaction has been uploaded + the full JSON in a code block. 
  when the user wants to change a detail, continue the conversation and ask for the specific field they want to change.
- Use no Markdown formatting in Telegram replies except for code blocks when uploading JSON. Emojis are allowed for clarity.
- Stay focused on the receipt extraction task only. If the user talks about other topics, politely remind them:
  "I'm here to help with your receipt details. Let's focus on that first."

Guardrails (What the AI Must NOT Do)
- Do not ask for the image again under any circumstance.
- Do not guess wildly or hallucinate data; only infer based on the visible text.
- Do not skip fields; always try to fill all required fields as best as possible.
- Do not upload or confirm without user approval.
- Do not use Markdown formatting except code blocks for final JSON output.
- Do not engage in unrelated conversation or topics during receipt processing.
- Do not provide partial JSON outputs—only provide JSON when all fields are complete and confirmed.
- Do not respond with vague or generic answers about the receipt; be precise and clear.
`;

const REQUIRED_FIELDS = [
  'type',
  'amount',
  'date',
  'source',
  'reference'
];

// In-memory chat history (cleared on server restart)
const chatHistories: Record<number, Array<{ role: 'user' | 'assistant', content: any }>> = {};

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

async function getTelegramPhotoUrl(fileId: string): Promise<string> {
  // Get file path from Telegram
  const res = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const data = await res.json();
  const filePath = data.result.file_path;
  return `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${filePath}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log('Received webhook:', JSON.stringify(body, null, 2));
  
  const message = body.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const telegramUserId =
    message.from?.id ||
    message.chat?.id ||
    (message.chat && typeof message.chat === 'object' && message.chat.id);

  // --- Register command handler ---
  if (message.text && message.text.startsWith('/register')) {
    const storeName = message.text.replace('/register', '').trim();
    if (!storeName) {
      await sendTelegram(chatId, "❗ Please provide a store name. Usage: /register <store name>");
      return NextResponse.json({ ok: true });
    }

    // Insert into stores table
    const { data, error } = await supabase
      .from('stores')
      .insert([
        {
          created_at: TODAY_UTC,
          store_name: storeName,
          telegram_id: telegramUserId,
        },
      ])
      .select()
      .single();

    if (error) {
      await sendTelegram(chatId, `❌ Registration failed: ${error.message}`);
    } else {
      await sendTelegram(chatId, `✅ Store "${storeName}" registered!`);
    }
    return NextResponse.json({ ok: true });
  }
  // --- End register command handler ---

  // --- Start command handler ---
  if (message.text && message.text.startsWith('/start')) {
    const token = message.text.replace('/start', '').trim();
    console.error('Received start command with token:', token);
    
    if (!token) {
      await sendTelegram(chatId, "❗ Please use the onboarding link provided by your store manager.");
      return NextResponse.json({ ok: true });
    }

    // First, let's check all employees with tokens to see what we have
    const { data: allEmployees, error: listError } = await supabase
      .from('employees')
      .select('id, employee_name, telegram_onboard_token')
      .not('telegram_onboard_token', 'is', null);

    console.error('All employees with tokens:', allEmployees);

    // Now find the specific employee
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, employee_name, store_id, telegram_onboard_token')
      .eq('telegram_onboard_token', token)
      .single();

    console.error('Employee lookup result:', { 
      searchedToken: token,
      foundEmployee: employee,
      error: employeeError 
    });

    if (employeeError) {
      console.error('Employee lookup error:', employeeError);
      await sendTelegram(chatId, "❌ Invalid or expired onboarding link. Please contact your store manager.");
      return NextResponse.json({ ok: true });
    }

    if (!employee) {
      console.error('No employee found with token:', token);
      await sendTelegram(chatId, "❌ Invalid or expired onboarding link. Please contact your store manager.");
      return NextResponse.json({ ok: true });
    }

    // Update employee with Telegram ID and confirmation status
    const { error: updateError } = await supabase
      .from('employees')
      .update({
        telegram_id: telegramUserId,
        telegram_bot_confirmed: true,
        telegram_onboard_token: null // Clear the token after use
      })
      .eq('id', employee.id);

    if (updateError) {
      console.error('Employee update error:', updateError);
      await sendTelegram(chatId, "❌ Failed to complete onboarding. Please try again or contact your store manager.");
      return NextResponse.json({ ok: true });
    }

    await sendTelegram(chatId, `✅ Welcome ${employee.employee_name}! You have been successfully onboarded. You can now start sending receipt photos.`);
    return NextResponse.json({ ok: true });
  }
  // --- End start command handler ---

  if (!chatHistories[chatId]) chatHistories[chatId] = [];

  if (!message.photo && chatHistories[chatId].length === 0) {
    await sendTelegram(chatId, "📷 Please send a photo of the receipt to begin.");
    return NextResponse.json({ ok: true });
  }

  let aiMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: transactionPrompt }
  ];

  if (message.photo) {
    chatHistories[chatId] = [];
    const photo = message.photo[message.photo.length - 1];
    const imageUrl = await getTelegramPhotoUrl(photo.file_id);

    const prefilled = {
      store_id: String(chatId),
      type: "cash",
      source: "telegram"
    };

    aiMessages.push(
      {
        role: 'assistant',
        content: `Here is the data I already know:\n\`\`\`json\n${JSON.stringify(prefilled, null, 2)}\n\`\`\`\nPlease extract the remaining fields from the receipt image.`
      },
      {
        role: 'user',
        content: [
          { type: "text", text: "Here is the receipt image." },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    );
    chatHistories[chatId] = aiMessages.slice(1)
      .filter(
        (msg): msg is { role: 'user' | 'assistant'; content: any } =>
          (msg.role === 'user' || msg.role === 'assistant')
      )
      .map(msg => ({ role: msg.role, content: msg.content }));
  } else if (message.text) {
    chatHistories[chatId].push({ role: 'user', content: message.text });
    aiMessages = aiMessages.concat(chatHistories[chatId]);
  } else {
    aiMessages = aiMessages.concat(chatHistories[chatId]);
  }

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: aiMessages,
    temperature: 0.2,
    max_tokens: 1000,
  });

  const aiReply = res.choices[0].message.content?.trim() ?? '';
  chatHistories[chatId].push({ role: 'assistant', content: aiReply });

  const replyWithoutJson = aiReply
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();

  const parsed = extractJSON(aiReply);

  if (parsed && REQUIRED_FIELDS.every(f => parsed[f] !== undefined && parsed[f] !== '' && parsed[f] !== 'unknown')) {
    console.log("Detected JSON from AI reply:", parsed);
    parsed.created_at = TODAY_UTC;
    const telegramUserId =
      message.from?.id ||
      message.chat?.id ||
      (message.chat && typeof message.chat === 'object' && message.chat.id);
    const { data: storeData, error: storeError } = await supabase
      .from('stores')
      .select('id')
      .eq('telegram_id', telegramUserId)
      .single();

    if (storeError || !storeData) {
      await sendTelegram(
        chatId,
        "❌ Store not found. Please register your store first by typing:\n/register <store name>"
      );
      return NextResponse.json({ ok: false });
    }
    parsed.store_id = storeData.id;
    console.log("Store ID found:", parsed.store_id);


    // Upload to DB
    const { data, error } = await supabase.from('transactions').insert([parsed]);
    console.log("Supabase insert result:", { data, error }); // <-- log result
    if (error) {
      await sendTelegram(
        chatId,
        `❌ Upload failed. Please try again.\nError: ${error.message || JSON.stringify(error)}`
      );
    } else {
      await sendTelegram(chatId, replyWithoutJson + "\n🎉 Uploaded successfully!");
    }
    delete chatHistories[chatId];
    return NextResponse.json({ ok: true });
  }

  // Otherwise, just send the AI's reply (without JSON code block)
  await sendTelegram(chatId, replyWithoutJson);
  return NextResponse.json({ ok: true });
}