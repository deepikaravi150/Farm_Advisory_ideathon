import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getItem, Tables } from '@/lib/aws/dynamodb';
import { draftDailySms, getActiveCropPlans, getLatestSoilReport, sendDailySmsForFarmer } from '@/lib/daily-sms';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const locale = req.nextUrl.searchParams.get('locale') ?? undefined;

  const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId });
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const [plans, soil] = await Promise.all([
    getActiveCropPlans(farmer.farmerId),
    getLatestSoilReport(farmer.farmerId),
  ]);

  if (!plans.length) {
    return NextResponse.json({
      available: false,
      reason: 'no_active_plan',
      message: '',
    });
  }

  const message = await draftDailySms(profile, plans, soil, locale);
  return NextResponse.json({
    available: true,
    language: locale ?? profile.preferred_language ?? 'en',
    phone: profile.phone,
    message,
  });
}

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId });
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const locale = typeof body.locale === 'string' ? body.locale : undefined;
    const result = await sendDailySmsForFarmer(profile, locale);
    if (!result.sent) {
      return NextResponse.json({ error: 'No active crop plan available for SMS' }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Daily SMS send error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Daily SMS sending failed',
    }, { status: 500 });
  }
}
