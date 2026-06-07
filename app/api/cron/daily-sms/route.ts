import { NextRequest, NextResponse } from 'next/server';
import { scanItems, Tables } from '@/lib/aws/dynamodb';
import { sendDailySmsForFarmer } from '@/lib/daily-sms';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET || process.env.ADMIN_SECRET;
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (expected && secret !== expected && !isVercelCron) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const farmers = await scanItems(Tables.FARMER_PROFILES);
  const verifiedFarmers = farmers.filter((farmer) => farmer.phone && farmer.phone_verified !== false);
  const results = [];

  for (const farmer of verifiedFarmers) {
    try {
      const result = await sendDailySmsForFarmer(farmer);
      results.push({
        farmerId: farmer.farmer_id,
        phone: farmer.phone,
        sent: result.sent,
        reason: result.reason,
      });
    } catch (error) {
      results.push({
        farmerId: farmer.farmer_id,
        phone: farmer.phone,
        sent: false,
        reason: error instanceof Error ? error.message : 'send_failed',
      });
    }
  }

  return NextResponse.json({
    success: true,
    totalFarmers: farmers.length,
    attempted: verifiedFarmers.length,
    sent: results.filter((item) => item.sent).length,
    results,
  });
}
