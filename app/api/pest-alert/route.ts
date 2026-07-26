import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getPendingAlerts } from '@/lib/pest-alert';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

// Pending pest-outbreak alerts near the logged-in farmer (for the Today widget).
export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const alerts = await getPendingAlerts(farmer.farmerId);
    return NextResponse.json({ alerts }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('Pest alert fetch error:', err);
    return NextResponse.json({ alerts: [] });
  }
}
