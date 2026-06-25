import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { getItem, Tables } from '@/lib/aws/dynamodb';
import { respondToPestAlert } from '@/lib/pest-alert';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

const RespondSchema = z.object({
  pestKey: z.string().min(1),
  response: z.enum(['clear', 'confirm']),
});

// A farmer responds to a pest alert: "clear" (no pest, suppress) or "confirm"
// (I have it too → new outbreak point that alerts their neighbours).
export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { pestKey, response } = RespondSchema.parse(await req.json());
    const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const result = await respondToPestAlert({
      farmerId: farmer.farmerId,
      farmerProfile: profile,
      pestKey,
      response,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Pest alert respond error:', err);
    return NextResponse.json({ error: 'Could not record your response' }, { status: 500 });
  }
}
