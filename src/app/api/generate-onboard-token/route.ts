import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/utils/supabase';

export async function POST(request: Request) {
  try {
    const { employeeId } = await request.json();

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Employee ID is required' },
        { status: 400 }
      );
    }

    // Generate a unique token
    const token = uuidv4();

    // Update the employee record with the new token
    const { error } = await supabase
      .from('employees')
      .update({ telegram_onboard_token: token })
      .eq('id', employeeId);

    if (error) {
      console.error('Error updating employee token:', error);
      return NextResponse.json(
        { error: 'Failed to update employee token' },
        { status: 500 }
      );
    }

    return NextResponse.json({ token });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 