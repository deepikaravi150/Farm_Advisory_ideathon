import { queryItems, Tables } from '@/lib/aws/dynamodb';
import { sendSMS } from '@/lib/aws/sns';
import { extractCentroid } from '@/lib/utils';
import { get15DayForecast } from '@/lib/weather';
import { nextStepFromPlan, weatherVerdict, type AppLocale, toAppLocale } from '@/lib/farm-advice';
import { chatWithBedrock } from '@/lib/ai/openai';

type Profile = Record<string, unknown>;
type Plan = Record<string, unknown> & {
  crop_name?: string;
  start_date?: string;
  active_from?: string;
  milestones?: Array<{
    label?: string;
    date?: string;
    endDate?: string;
    tasks?: string;
    alert?: boolean;
    alertAdvice?: string;
  }>;
};
type Soil = Record<string, unknown>;

function normalizeLevel(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function splitTask(task?: string) {
  if (!task) return [];
  return task
    .split(/[.;]\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().split('T')[0];
}

function dayDiff(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);
}

function normalizeActivePlanDates(plan: Plan): Plan {
  if (!plan.active_from || !plan.start_date || !Array.isArray(plan.milestones)) return plan;
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

function soilPoints(soil: Soil | null) {
  if (!soil) return [];
  const points: string[] = [];
  const ph = soil.ph;
  const n = normalizeLevel(soil.nitrogen);
  const p = normalizeLevel(soil.phosphorus);
  const k = normalizeLevel(soil.potassium);

  if (ph != null && ph !== '') points.push(`Soil pH ${ph}; follow correction from the soil report.`);
  if (n === 'low') points.push('Nitrogen is low; use crop-suitable N or manure dose.');
  if (p === 'low') points.push('Phosphorus is low; add the recommended basal P dose.');
  if (k === 'low') points.push('Potassium is low; add K for plant strength and yield.');
  return points;
}

function fertilizerPoint(plans: Plan[]) {
  const text = plans
    .flatMap((plan) => plan.milestones ?? [])
    .map((milestone) => `${milestone.label ?? ''} ${milestone.tasks ?? ''}`)
    .join(' ')
    .toLowerCase();

  if (/(fertil|nutrient|manure|compost|urea|dap|potash|npk|micronutrient)/.test(text)) {
    return 'Nutrient work is included now; apply only the recommended dose.';
  }
  return 'Check crop color and growth before any fertilizer top-dressing.';
}

async function translateSms(message: string, locale: AppLocale) {
  if (locale === 'en') return message;
  try {
    const language = locale === 'ta' ? 'Tamil' : 'Hindi';
    const translated = await chatWithBedrock(
      [{
        role: 'user',
        content: `Translate this farmer SMS fully into ${language}.

Rules:
- Keep FarmAdvisor brand name unchanged.
- Keep numbering 1-10.
- Keep numbers, pH, N, P, K, dates, units, and currency unchanged.
- Translate crop names, stage names, tasks, weather advice, soil advice, village/district names if present.
- Return only the translated SMS text.

SMS:
${message}`,
      }],
      `You translate agricultural SMS messages for Tamil Nadu farmers into ${language}. Return only translated text.`,
      { maxTokens: 1200 },
    );
    return translated.trim() || message;
  } catch (error) {
    console.error('Daily SMS translation failed:', error);
    return message;
  }
}

export async function getLatestSoilReport(farmerId: string) {
  const reports = await queryItems({
    TableName: Tables.SOIL_REPORTS,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmerId },
    ScanIndexForward: false,
    Limit: 5,
  }).catch(() => []);
  return (reports.find((r) => r.is_current) ?? reports[0] ?? null) as Soil | null;
}

export async function getActiveCropPlans(farmerId: string) {
  const plans = await queryItems({
    TableName: Tables.CROP_PLANS,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmerId },
    ScanIndexForward: false,
    Limit: 20,
  }).catch(() => []);

  return plans
    .filter((plan) => plan.status === 'active')
    .map((plan) => normalizeActivePlanDates(plan as Plan));
}

export async function getActiveCropPlan(farmerId: string) {
  const plans = await getActiveCropPlans(farmerId);
  return plans[0] ?? null;
}

export async function draftDailySms(profile: Profile, planOrPlans: Plan | Plan[] | null, soil: Soil | null, localeOverride?: string) {
  const locale = toAppLocale((localeOverride ?? profile.preferred_language) as string | undefined);
  const plans = (Array.isArray(planOrPlans) ? planOrPlans : planOrPlans ? [planOrPlans] : []).map(normalizeActivePlanDates);
  const today = new Date().toISOString().split('T')[0];
  const coords = (profile.land_coordinates as Array<{ lat: number; lng: number }> | undefined) ?? [];
  const center = coords.length ? extractCentroid(coords) : null;
  const forecast = center ? await get15DayForecast(center.lat, center.lng).catch(() => []) : [];
  const weather = weatherVerdict(forecast, 'en');

  const planPoints = plans.flatMap((plan) => {
    const crop = plan.crop_name || 'your crop';
    const step = nextStepFromPlan(plan, today);
    const taskBits = splitTask(step?.tasks).slice(0, 1).map((task) => `${crop}: ${task}`);
    return [
      step?.label ? `${crop}: ${step.label}.` : `${crop}: check the field today.`,
      ...taskBits,
      ...(step?.alertAdvice ? [`${crop}: ${step.alertAdvice}`] : []),
    ];
  });

  const points = [
    ...planPoints,
    weather.action,
    ...soilPoints(soil),
    fertilizerPoint(plans),
    'Check pest/disease signs on leaves before evening.',
  ].filter(Boolean).slice(0, 10);

  const cropList = plans.map((plan) => plan.crop_name).filter(Boolean).join(', ');
  const message = `Daily farm advice${cropList ? ` for ${cropList}` : ''}\n${points.map((point, index) => `${index + 1}. ${point}`).join('\n')}`;
  return translateSms(message, locale);
}

export async function sendDailySmsForFarmer(profile: Profile, localeOverride?: string) {
  if (!profile.phone) throw new Error('No phone number on profile');
  const farmerId = String(profile.farmer_id ?? '');
  const [plans, soil] = await Promise.all([
    getActiveCropPlans(farmerId),
    getLatestSoilReport(farmerId),
  ]);
  if (!plans.length) return { sent: false, reason: 'no_active_plan', message: '' };
  const message = await draftDailySms(profile, plans, soil, localeOverride);
  await sendSMS(String(profile.phone), message);
  return { sent: true, message };
}
