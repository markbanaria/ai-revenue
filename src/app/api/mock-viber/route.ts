import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const storeId = formData.get('store_id')?.toString() || 'store_001';
    const sender = formData.get('sender')?.toString() || 'MJ';
    const imageFile = formData.get('image') as File;

    const fileName = `${Date.now()}-${imageFile.name}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('deposit-slips')
      .upload(fileName, imageFile);

    if (uploadError) throw uploadError;

    // Simulated OCR + RAG logic
    const mockAmount = 1532.75;
    const mockDate = new Date().toISOString().split('T')[0];

    const { error: dbError } = await supabase.from('transactions').insert({
      store_id: storeId,
      sender,
      image_path: fileName,
      amount: mockAmount,
      date: mockDate,
      source: 'viber',
      status: 'pending_validation',
    });

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, fileName });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}