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

Try very hard to match the image text to the fileds in the schema. Intelligently infer the contents of the image text with these fields. THIS IS YOUR #1 JOB.

If you have all fields, reply with a message like
Here are your receipt details: ..., would you like to change anything or can I upload it?
When confirming always show ALL details. do not upload without having show ALL details. 
Dont format with **item**: ... TG doesnt do markdown. maybe use emojis instead.

Do not prioritise leaving missing fields. prioritise filling in details using the image text.
DO NOT ASK FOR THE IAMGE AGAIN.

Save the date always in YYYY-MM-DD format.

If you are missing any fields, reply with a message like "sender: john"
if the user has confirmed the details, reply with "Your transaction has been uploaded." and include the JSON in a code block.
IF THE USER CONFIRMED, MAKE SURE TO ALWAYS REPLY WITH THE JSON IN A CODE BLOCK.
"Your transaction has been uploaded." and include the JSON in a code block. 

If not, ask the user for the missing info conversationally. 
You should mention all the missing fields, but then right after, ask it for just one field. 
eg. sender and amount still missing, first can you send the sender?

Always keep the conversation natural and friendly. 
Only include the JSON when all fields are filled.
`;

const REQUIRED_FIELDS = ['store_id', 'type', 'amount', 'date', 'source', 'reference', 'sender'];

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
  const message = body.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  if (!chatHistories[chatId]) chatHistories[chatId] = [];

  // If no image has been sent yet, prompt the user for an image
  if (!message.photo && chatHistories[chatId].length === 0) {
    await sendTelegram(chatId, "📷 Please send a photo of the receipt to begin.");
    return NextResponse.json({ ok: true });
  }

  let aiMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: transactionPrompt }
  ];

  if (message.photo) {
    // Refresh the whole thread: clear chat history for this chat when a new image is sent
    chatHistories[chatId] = [];

    // Get the highest resolution photo
    const photo = message.photo[message.photo.length - 1];
    const imageUrl = await getTelegramPhotoUrl(photo.file_id);

    // Prefill known fields
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
    // Store only the conversation (not the system prompt) for future turns
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

  // Remove any JSON code block from the AI reply for Telegram messages
  const replyWithoutJson = aiReply
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();

  // Check if AI reply contains a JSON block (transaction complete)
  const parsed = extractJSON(aiReply);
  if (parsed && REQUIRED_FIELDS.every(f => parsed[f] !== undefined && parsed[f] !== '' && parsed[f] !== 'unknown')) {
    // Upload to DB
    const { error } = await supabase.from('transactions').insert([parsed]);
    if (error) {
      await sendTelegram(chatId, "❌ Upload failed. Please try again.");
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