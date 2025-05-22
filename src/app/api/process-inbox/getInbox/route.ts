import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const nylasAccessToken = process.env.NYLAS_ACCESS_TOKEN; // Set this in your env
  const grantId = process.env.NYLAS_GRANT_ID; // Set this in your env

  if (!nylasAccessToken) {
    return NextResponse.json({ error: 'Missing Nylas access token' }, { status: 500 });
  }

  if (!grantId) {
    return NextResponse.json({ error: 'Missing Nylas grant id' }, { status: 500 });
  }

  const nylasApiUrl = `https://api.nylas.com/messages?limit=10&grant_id=${grantId}`;

  const response = await fetch(nylasApiUrl, {
    headers: {
      Authorization: `Bearer ${nylasAccessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    return NextResponse.json({ error }, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}