// app/api/process-inbox/route.ts
import { NextRequest, NextResponse } from 'next/server';
import openai from '@/utils/openai';
import { createClient } from '@supabase/supabase-js';
import inbox from '@/mock/emailInbox.json';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const prompt = `
Extract all money transactions and return them in this schema:

{
  store_id: string,
  type: "ewallet",
  amount: number,
  date: string,
  source: "email",
  reference: string,
  sender: string
}

Only include transactions where money was received.
`;

    const input = inbox.map(msg => `EMAIL:\nSubject: ${msg.subject}\nBody: ${msg.body}`).join('\n\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a smart email parser for GCash transactions.' },
        { role: 'user', content: `${prompt}\n\n${input}` }
      ],
      temperature: 0.2
    });

    const parsedData = JSON.parse(response.choices[0].message.content || '[]');

    const { error: insertError } = await supabase.from('transactions').insert(parsedData);
    if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

    return NextResponse.json({ success: true, rows: parsedData.length });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
