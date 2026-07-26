import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getItem, Tables } from '@/lib/aws/dynamodb';
import { extractCentroid } from '@/lib/utils';
import { get15DayForecast } from '@/lib/weather';
import { getActiveCropPlans, getLatestSoilReport } from '@/lib/daily-sms';
import { buildTodayPlan } from '@/lib/today-plan';
import { nextStepFromPlan } from '@/lib/farm-advice';
import { chatWithBedrock } from '@/lib/ai/openai';

// Calls the LLM for the daily focus line; allow up to 60s on Vercel.
export const maxDuration = 60;

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

function languageName(locale: string) {
  return locale === 'ta' ? 'Tamil' : locale === 'hi' ? 'Hindi' : 'English';
}

/**
 * Returns a short, warm, AI-written "focus for today" line for the Today tab.
 * The structured checklist itself is built deterministically on the page; this
 * endpoint only adds a friendly headline and degrades to a simple line on error.
 */
export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const localeParam = req.nextUrl.searchParams.get('locale') ?? 'en';
  const locale = ['en', 'hi', 'ta'].includes(localeParam) ? localeParam : 'en';
  const today = new Date().toISOString().split('T')[0];

  try {
    const [profile, plans, soil] = await Promise.all([
      getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId }),
      getActiveCropPlans(farmer.farmerId),
      getLatestSoilReport(farmer.farmerId),
    ]);

    const coords = (profile?.land_coordinates as Array<{ lat: number; lng: number }>) ?? [];
    const center = coords.length ? extractCentroid(coords) : null;
    const forecast = center ? await get15DayForecast(center.lat, center.lng).catch(() => []) : [];

    const base = buildTodayPlan({ plans, forecast, locale, today });

    if (!base.hasActivePlan) {
      return NextResponse.json({
        focus: 'No active crop plan yet — create one to get a daily plan tailored to your field.',
        ...base,
      });
    }

    const activeStages = plans
      .map((p) => {
        const step = nextStepFromPlan(p, today);
        return step ? `${p.crop_name}: ${step.state === 'active' ? `now in "${step.label}"` : `"${step.label}" starts in ${step.daysAway} days`}` : '';
      })
      .filter(Boolean)
      .join('; ');

    const weatherLine = base.weatherAlert
      ? `Weather warning: ${base.weatherAlert.title} — ${base.weatherAlert.detail}`
      : 'Weather is fine for field work this week.';

    const soilLine = soil?.plain_language_summary ? `Soil note: ${soil.plain_language_summary}` : '';

    const focus = await chatWithBedrock(
      [{
        role: 'user',
        content: `Write ONE warm, encouraging sentence (max 25 words) telling this Tamil Nadu farmer what to focus on today.
Context:
- Crops & stage: ${activeStages || 'unknown'}
- ${weatherLine}
- ${soilLine}
Rules: speak directly to the farmer, be specific and practical, no greeting, no emoji, plain text only. Write it in ${languageName(locale)}.`,
      }],
      `You are FarmAdvisor, a practical Tamil Nadu farm advisor. Reply with a single plain-text sentence in ${languageName(locale)}.`,
      { maxTokens: 120 },
    );

    return NextResponse.json({ focus: focus.trim(), ...base });
  } catch (err) {
    console.error('Today focus generation failed:', err);
    return NextResponse.json({ focus: '', error: 'focus_unavailable' });
  }
}
