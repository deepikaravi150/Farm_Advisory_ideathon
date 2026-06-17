import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { verifyToken } from '@/lib/auth';
import { getItem, Tables } from '@/lib/aws/dynamodb';
import { extractCentroid } from '@/lib/utils';
import { get15DayForecast, type ForecastDay } from '@/lib/weather';
import { getActiveCropPlans } from '@/lib/daily-sms';
import { buildTodayPlan } from '@/lib/today-plan';
import TodayView from '@/components/today/TodayView';

export default async function TodayPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) redirect('/login');

  const locale = await getLocale();
  const today = new Date().toISOString().split('T')[0];

  const [profile, plans] = await Promise.all([
    getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId }),
    getActiveCropPlans(farmer.farmerId),
  ]);

  const coords = (profile?.land_coordinates as Array<{ lat: number; lng: number }>) ?? [];
  const center = coords.length ? extractCentroid(coords) : null;
  let forecast: ForecastDay[] = [];
  try {
    if (center) forecast = await get15DayForecast(center.lat, center.lng);
  } catch (e) {
    console.error('Today weather fetch failed:', e);
  }

  const base = buildTodayPlan({ plans, forecast, locale, today });

  const dateLabel = new Date().toLocaleDateString(
    ({ en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' } as Record<string, string>)[locale] ?? 'en-IN',
    { weekday: 'long', day: 'numeric', month: 'long' },
  );

  return (
    <TodayView
      base={base}
      locale={locale}
      farmerName={farmer.name}
      dateLabel={dateLabel}
    />
  );
}
