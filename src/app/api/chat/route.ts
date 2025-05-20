import { NextRequest, NextResponse } from 'next/server';
import openai from '@/utils/openai';

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    temperature: 0.7
  });

  return NextResponse.json(response.choices[0].message);
}