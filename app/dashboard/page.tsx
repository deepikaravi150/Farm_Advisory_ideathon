import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { verifyToken } from '@/lib/auth';
import { getItem, queryItems, Tables } from '@/lib/aws/dynamodb';
import { extractCentroid } from '@/lib/utils';
import { getCurrentWeather, get15DayForecast, type CurrentWeather, type ForecastDay } from '@/lib/weather';
import Navbar from '@/components/layout/Navbar';
import TodayActionBanner from '@/components/dashboard/TodayActionBanner';
import WeatherWidget from '@/components/dashboard/WeatherWidget';
import CropPlanNextStepWidget, { type PlanItem } from '@/components/dashboard/CropPlanNextStepWidget';
import SoilHealthWidget, { type SoilSummary } from '@/components/dashboard/SoilHealthWidget';
import MarketPricesWidget from '@/components/dashboard/MarketPricesWidget';
import ChatSummaryWidget from '@/components/dashboard/ChatSummaryWidget';
import ChatPanel from '@/components/chatbot/ChatPanel';
import LandMapWidget from '@/components/dashboard/LandMapWidgetClient';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) redirect('/login');

  const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId });

  // Fetch weather, soil report, and crop plans server-side so the dashboard renders
  // instantly and several widgets can share the same data without re-fetching.
  const coords = (profile?.land_coordinates as Array<{ lat: number; lng: number }>) ?? [];
  const { lat, lng } = coords.length ? extractCentroid(coords) : { lat: 13.0827, lng: 80.2707 };

  const [weatherData, soilReports, cropPlans] = await Promise.all([
    (async (): Promise<{ current: CurrentWeather | null; forecast: ForecastDay[] }> => {
      try {
        const [current, forecast] = await Promise.all([
          getCurrentWeather(lat, lng),
          get15DayForecast(lat, lng),
        ]);
        return { current, forecast };
      } catch (e) {
        console.error('Dashboard weather fetch failed:', e);
        return { current: null, forecast: [] };
      }
    })(),
    queryItems({
      TableName: Tables.SOIL_REPORTS,
      KeyConditionExpression: 'farmer_id = :fid',
      ExpressionAttributeValues: { ':fid': farmer.farmerId },
      ScanIndexForward: false,
      Limit: 1,
    }).catch(() => []),
    queryItems({
      TableName: Tables.CROP_PLANS,
      KeyConditionExpression: 'farmer_id = :fid',
      ExpressionAttributeValues: { ':fid': farmer.farmerId },
      ScanIndexForward: false,
      Limit: 10,
    }).catch(() => []),
  ]);

  const soil = (soilReports[0] as unknown as SoilSummary | undefined) ?? null;
  // Prefer an active plan, otherwise the most recently created one.
  const plan = ((cropPlans.find((p) => p.status === 'active') ?? cropPlans[0]) ?? null) as unknown as PlanItem | null;

  // Only seed the market widget with the crop name when it is plain English
  // (the data.gov.in commodity filter does not understand Tamil/Hindi names).
  const cropName = typeof plan?.crop_name === 'string' ? plan.crop_name : '';
  const marketDefault = /^[\x20-\x7E]+$/.test(cropName) ? cropName : undefined;

  const t = await getTranslations('dashboard');
  const locale = await getLocale();
  const dateLocale = ({ en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' } as Record<string, string>)[locale] ?? 'en-IN';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar farmerName={farmer.name} />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">{t('greeting', { name: farmer.name })}</h1>
        <p className="text-sm text-gray-500 mb-6">{new Date().toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <TodayActionBanner
          current={weatherData.current}
          forecast={weatherData.forecast}
          plan={plan}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — widgets */}
          <div className="lg:col-span-2 space-y-6">
            <WeatherWidget current={weatherData.current} forecast={weatherData.forecast} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CropPlanNextStepWidget plan={plan} />
              <SoilHealthWidget soil={soil} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MarketPricesWidget defaultCommodity={marketDefault} />
              <LandMapWidget
                coordinates={coords}
                landArea={(profile?.land_area_acres as number) ?? 0}
                s3ImageKey={profile?.land_picture_s3_key as string | undefined}
              />
            </div>

            <ChatSummaryWidget />
          </div>

          {/* Right column — chat */}
          <div className="lg:col-span-1 h-[600px]">
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
