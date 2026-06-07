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
import SuitableCropsWidget from '@/components/dashboard/SuitableCropsWidget';
import ChatSummaryWidget from '@/components/dashboard/ChatSummaryWidget';
import DailySmsWidget from '@/components/dashboard/DailySmsWidget';
import ChatPanel from '@/components/chatbot/ChatPanel';
import LandMapWidget from '@/components/dashboard/LandMapWidgetClient';

type DashboardPlan = PlanItem & {
  start_date?: string;
  active_from?: string;
};

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().split('T')[0];
}

function dayDiff(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);
}

function normalizeActivePlanDates(plan: DashboardPlan | null): DashboardPlan | null {
  if (!plan?.active_from || !plan.start_date || !Array.isArray(plan.milestones)) return plan;
  const offset = dayDiff(plan.start_date, plan.active_from);
  if (offset === 0) return plan;

  return {
    ...plan,
    milestones: plan.milestones.map((milestone) => ({
      ...milestone,
      date: milestone.date ? addDays(milestone.date, offset) : milestone.date,
      endDate: milestone.endDate ? addDays(milestone.endDate, offset) : milestone.endDate,
    })),
  };
}

export default async function DashboardPage(props: any) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const selectedChatId = typeof searchParams.chat === 'string' ? searchParams.chat : null;
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) redirect('/login');

  const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId });

  // Fetch weather, soil report, and crop plans server-side so the dashboard renders
  // instantly and several widgets can share the same data without re-fetching.
  const coords = (profile?.land_coordinates as Array<{ lat: number; lng: number }>) ?? [];
  const landCenter = coords.length ? extractCentroid(coords) : null;

  const [weatherData, soilReports, cropPlans, selectedChatMatches] = await Promise.all([
    (async (): Promise<{ current: CurrentWeather | null; forecast: ForecastDay[] }> => {
      try {
        if (!landCenter) return { current: null, forecast: [] };
        const [current, forecast] = await Promise.all([
          getCurrentWeather(landCenter.lat, landCenter.lng),
          get15DayForecast(landCenter.lat, landCenter.lng),
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
    selectedChatId
      ? queryItems({
          TableName: Tables.CHAT_HISTORY,
          KeyConditionExpression: 'farmer_id = :fid',
          ExpressionAttributeValues: { ':fid': farmer.farmerId },
          ScanIndexForward: false,
          Limit: 25,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const rawSoil = (soilReports[0] as Record<string, unknown> | undefined) ?? null;
  const soil = rawSoil ? {
    ph: (rawSoil.ph as number | null | undefined) ?? null,
    nitrogen: (rawSoil.nitrogen as string | null | undefined) ?? null,
    phosphorus: (rawSoil.phosphorus as string | null | undefined) ?? null,
    potassium: (rawSoil.potassium as string | null | undefined) ?? null,
    plain_language_summary: (rawSoil.plain_language_summary as string | null | undefined) ?? null,
    key_findings: (rawSoil.key_findings as string[] | null | undefined) ?? null,
    recommendations: (rawSoil.recommendations as string[] | string | null | undefined) ?? null,
    locale: (rawSoil.locale as string | null | undefined) ?? null,
  } satisfies SoilSummary : null;
  // Dashboard must show every active crop plan. If a plan is made inactive
  // or deleted, dashboard crop-plan-dependent widgets should remove it.
  const activePlans = cropPlans
    .filter((p) => p.status === 'active')
    .map((p) => normalizeActivePlanDates(p as unknown as DashboardPlan))
    .filter((p): p is DashboardPlan => Boolean(p));
  const plan = activePlans[0] ?? null;

  // Only seed the market widget with the crop name when it is plain English
  // (the data.gov.in commodity filter does not understand Tamil/Hindi names).
  const cropName = typeof plan?.crop_name === 'string' ? plan.crop_name : '';
  const marketDefault = /^[\x20-\x7E]+$/.test(cropName) ? cropName : undefined;

  const t = await getTranslations('dashboard');
  const locale = await getLocale();
  const dateLocale = ({ en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' } as Record<string, string>)[locale] ?? 'en-IN';
  const selectedChat = selectedChatId
    ? selectedChatMatches.find((entry) => entry.chat_id === selectedChatId)
    : null;
  const selectedMessages = Array.isArray(selectedChat?.messages)
    ? selectedChat.messages as Array<{ role: 'user' | 'assistant'; content: string }>
    : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar farmerName={farmer.name} />
      <main className="mx-auto max-w-[1440px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('greeting', { name: farmer.name })}</h1>
            <p className="mt-1 text-sm text-gray-500">{new Date().toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <TodayActionBanner
          current={weatherData.current}
          forecast={weatherData.forecast}
          plans={activePlans}
        />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
          {/* Left column — widgets */}
          <div className="space-y-5">
            <WeatherWidget current={weatherData.current} forecast={weatherData.forecast} />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <CropPlanNextStepWidget plans={activePlans} />
              <SoilHealthWidget soil={soil} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
              <MarketPricesWidget defaultCommodity={marketDefault} />
              <LandMapWidget
                coordinates={coords}
                landArea={(profile?.land_area_acres as number) ?? 0}
                s3ImageKey={profile?.land_picture_s3_key as string | undefined}
              />
            </div>

            <SuitableCropsWidget />
            <DailySmsWidget />
          </div>

          {/* Right column — chat */}
          <div className="space-y-5 xl:sticky xl:top-24">
            <div className="h-[520px] sm:h-[600px] xl:h-[560px]">
              <ChatPanel
                initialMessages={selectedMessages}
                chatId={selectedChat?.chat_id as string | undefined}
                chatTimestamp={selectedChat?.timestamp as string | undefined}
              />
            </div>
            <ChatSummaryWidget />
          </div>
        </div>
      </main>
    </div>
  );
}
