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

If you have all fields, reply with a message like "Your transaction has been uploaded." and include the JSON in a code block. If not, ask the user for the missing info conversationally. Always keep the conversation natural and friendly. Only include the JSON when all fields are filled.
`;

const REQUIRED_FIELDS = ['store_id', 'type', 'amount', 'date', 'source', 'reference', 'sender'];

// In-memory chat history (cleared on server restart)
const chatHistories: Record<number, Array<{ role: 'user' | 'assistant', content: string }>> = {};

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

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  if (!chatHistories[chatId]) chatHistories[chatId] = [];

  // Add user message to history
  if (message.text) {
    chatHistories[chatId].push({ role: 'user', content: message.text });
  } else if (message.photo) {
    // For images, just add a placeholder (or you can implement OCR/image-to-text if needed)
    chatHistories[chatId].push({ role: 'user', content: '[Photo of receipt attached]' });
  }

  // Compose AI prompt with full chat history
  const aiMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: transactionPrompt },
    ...chatHistories[chatId]
  ];

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: aiMessages,
    temperature: 0.2,
    max_tokens: 1000,
  });

  const aiReply = res.choices[0].message.content?.trim() ?? '';
  chatHistories[chatId].push({ role: 'assistant', content: aiReply });

  // Check if AI reply contains a JSON block (transaction complete)
  const parsed = extractJSON(aiReply);
  if (parsed && REQUIRED_FIELDS.every(f => parsed[f] !== undefined && parsed[f] !== '' && parsed[f] !== 'unknown')) {
    // Upload to DB
    const { error } = await supabase.from('transactions').insert([parsed]);
    if (error) {
      await sendTelegram(chatId, "❌ Upload failed. Please try again.");
    } else {
      await sendTelegram(chatId, aiReply.replace(/```json[\s\S]*?```/, '').trim() + "\n🎉 Uploaded successfully!");
    }
    delete chatHistories[chatId];
    return NextResponse.json({ ok: true });
  }

  // Otherwise, just send the AI's reply
  await sendTelegram(chatId, aiReply);
  return NextResponse.json({ ok: true });
}