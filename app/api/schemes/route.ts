import { NextRequest, NextResponse } from 'next/server';
import { scanItems, putItem, Tables } from '@/lib/aws/dynamodb';
import { generateId } from '@/lib/utils';

export async function GET() {
  try {
    const schemes = await scanItems(Tables.GOVERNMENT_SCHEMES);
    return NextResponse.json(schemes);
  } catch (err) {
    console.error('Schemes fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch schemes' }, { status: 500 });
  }
}

// Admin-only seed endpoint (protect with a secret header in production)
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const schemes = await req.json();
  for (const scheme of schemes) {
    await putItem(Tables.GOVERNMENT_SCHEMES, {
      scheme_id: generateId(),
      ...scheme,
      created_at: new Date().toISOString(),
    });
  }
  return NextResponse.json({ seeded: schemes.length });
}
