import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { chatWithBedrock } from '@/lib/ai/openai';
import { queryItems, putItem, getItem, Tables } from '@/lib/aws/dynamodb';
import { generateId, extractCentroid } from '@/lib/utils';
import { get15DayForecast, type ForecastDay } from '@/lib/weather';
import { annotateMilestonesWithWeather, forecastSummaryForPrompt } from '@/lib/crop-plan-weather';
import type { Milestone } from '@/lib/types/crop-plan';

/** Best-effort 16-day forecast for the farmer's land (centroid, else Chennai). */
async function getFarmerForecast(profile: Record<string, unknown> | null): Promise<ForecastDay[]> {
  try {
    const coords = profile?.land_coordinates as Array<{ lat: number; lng: number }> | undefined;
    const { lat, lng } = coords?.length ? extractCentroid(coords) : { lat: 13.0827, lng: 80.2707 };
    return await get15DayForecast(lat, lng);
  } catch (e) {
    console.error('Crop-plan forecast fetch failed:', e);
    return [];
  }
}

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const plans = await queryItems({
    TableName: Tables.CROP_PLANS,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmer.farmerId },
    ScanIndexForward: false,
    Limit: 5,
  });

  return NextResponse.json(plans);
}

const GeneratePlanSchema = z.object({
  cropName: z.string().optional(),
  farmerState: z.enum(['planning_unsure', 'planning_specific', 'mid_grow']),
  currentCropInfo: z.string().optional(),
  assessment: z.record(z.string()).optional(),
  // Date the farmer plans to start (anchor for milestone scheduling).
  startDate: z.string().optional(),
  locale: z.enum(['en', 'hi', 'ta']).default('en'),
});

// Human-readable labels for the assessment answers collected by the modal.
const ASSESSMENT_LABELS: Record<string, string> = {
  experience: 'Farming experience',
  grownBefore: 'Grown crops on this land before',
  previousCrops: 'Previous crops on this land',
  lastGrownWhen: 'Last grown',
  lastHarvest: 'Last harvest quality',
  pastIssues: 'Past problems faced',
  irrigation: 'Irrigation source',
  fertilizers: 'Fertilizers used',
};

function formatAssessment(a?: Record<string, string>): string {
  if (!a) return '';
  const lines = Object.entries(a)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${ASSESSMENT_LABELS[k] ?? k}: ${v}`);
  return lines.length
    ? `\n\nFarmer's land & experience assessment (use this to customize the plan — choose crops/inputs/schedule that fit their experience level, irrigation, soil history and past issues):\n${lines.join('\n')}`
    : '';
}

// Normalize the various LLM JSON shapes into the CropPlan the UI expects.
function normalizePlan(p: Record<string, unknown> | undefined | null, startDate: string): NormalizedPlan | null {
  if (!p || !p.cropName) return null;
  return {
    cropName: String(p.cropName),
    startDate: String(p.startDate ?? startDate),
    milestones: (p.milestones ?? p.remainingMilestones ?? []) as Milestone[],
    totalBudgetEstimate: Number(p.totalBudgetEstimate ?? 0),
    harvestDate: String(p.harvestDate ?? ''),
    sellWindow: String(p.sellWindow ?? ''),
    storageNotes: String(p.storageNotes ?? ''),
  };
}

interface NormalizedPlan {
  cropName: string;
  startDate: string;
  milestones: Milestone[];
  totalBudgetEstimate: number;
  harvestDate: string;
  sellWindow: string;
  storageNotes: string;
}

async function persistPlan(
  farmerId: string,
  plan: NormalizedPlan,
  status: string,
  currentStage: string | null
) {
  const alertStages = plan.milestones.filter((m) => m.alert).map((m) => m.label);
  await putItem(Tables.CROP_PLANS, {
    farmer_id: farmerId,
    plan_id: generateId(),
    crop_name: plan.cropName,
    start_date: plan.startDate,
    milestones: plan.milestones,
    harvest_date: plan.harvestDate,
    sell_window: plan.sellWindow,
    storage_notes: plan.storageNotes,
    budget_estimate: plan.totalBudgetEstimate,
    status,
    current_stage: currentStage,
    weather_alerts: alertStages,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

const SavePlanSchema = z.object({
  action: z.literal('save'),
  plan: z.object({
    cropName: z.string(),
    startDate: z.string().optional(),
    milestones: z.array(z.any()).default([]),
    totalBudgetEstimate: z.number().default(0),
    harvestDate: z.string().default(''),
    sellWindow: z.string().default(''),
    storageNotes: z.string().default(''),
  }),
});

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // Branch: persist a plan the farmer selected from AI suggestions.
    if (body?.action === 'save') {
      const { plan } = SavePlanSchema.parse(body);
      const today = new Date().toISOString().split('T')[0];
      await persistPlan(
        farmer.farmerId,
        { ...plan, startDate: plan.startDate ?? today } as NormalizedPlan,
        'planned',
        null
      );
      return NextResponse.json({ success: true });
    }

    const data = GeneratePlanSchema.parse(body);
    const assessmentText = formatAssessment(data.assessment);

    const [profile, soilReports] = await Promise.all([
      getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId }),
      queryItems({
        TableName: Tables.SOIL_REPORTS,
        KeyConditionExpression: 'farmer_id = :fid',
        ExpressionAttributeValues: { ':fid': farmer.farmerId },
        ScanIndexForward: false,
        Limit: 1,
      }),
    ]);

    const soilData = soilReports[0];
    const today = new Date().toISOString().split('T')[0];
    const startDate = data.startDate || today;
    const forecast = await getFarmerForecast(profile);
    const forecastBlock = forecast.length
      ? `\n\n16-day weather forecast for the farmer's land (use this to schedule weather-sensitive stages — sowing, spraying, fertilizing, harvesting — away from heavy rain/storm days where possible):\n${forecastSummaryForPrompt(forecast)}`
      : '';

    // Shared instruction: every milestone must be detailed, dated as a range
    // anchored on the farmer's chosen start date, and say exactly what to do.
    const milestoneSpec = `Each milestone object MUST have:
           {
             "id": "1",
             "label": "short stage name",
             "date": "YYYY-MM-DD (stage start)",
             "endDate": "YYYY-MM-DD (stage end)",
             "durationDays": number,
             "tasks": "detailed, step-by-step actions the farmer should perform in this stage — what to do, quantities, inputs, and how (write 2-4 sentences or '- ' bullets)",
             "estimatedCost": number (INR),
             "weatherRequirement": "the ideal weather for this stage and what to avoid"
           }
         Rules:
         - The FIRST stage starts on ${startDate}. Every later stage's "date" follows the previous stage's "endDate" with no gaps/overlaps.
         - Produce 6-10 well-sequenced stages from land preparation through to selling.
         - Keep all dates consistent with durationDays and the ${startDate} anchor.`;

    const planPrompt = data.farmerState === 'planning_unsure'
      ? `Suggest the top 3 best crops to grow for a Tamil Nadu farmer with the following profile:
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres, ${profile?.typography ?? 'general land'}
         - Soil: ${soilData ? `pH ${soilData.ph}, N:${soilData.nitrogen} P:${soilData.phosphorus} K:${soilData.potassium}` : 'no soil data'}
         - Today: ${today}
         - Farmer wants to start on: ${startDate}${assessmentText}${forecastBlock}

         For each crop, provide a detailed JSON plan:
         {
           "suggestedCrops": [
             {
               "cropName": "...",
               "reason": "why it fits this farmer's land/soil/season/experience",
               "season": "...",
               "estimatedRevenue": "...",
               "startDate": "${startDate}",
               "milestones": [ ...detailed milestones... ],
               "totalBudgetEstimate": 0,
               "harvestDate": "YYYY-MM-DD",
               "sellWindow": "...",
               "storageNotes": "..."
             }
           ]
         }
         ${milestoneSpec}
         Return only valid JSON.`
      : data.farmerState === 'planning_specific'
      ? `Validate and create a detailed crop plan for growing ${data.cropName} for a Tamil Nadu farmer:
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres
         - Soil: ${soilData ? `pH ${soilData.ph}, N:${soilData.nitrogen} P:${soilData.phosphorus} K:${soilData.potassium}` : 'no soil data'}
         - Today: ${today}
         - Farmer wants to start on: ${startDate}${assessmentText}${forecastBlock}

         Assess if ${data.cropName} is suitable, then return JSON:
         {
           "suitable": true/false,
           "suitabilityReason": "...",
           "adjustments": "...",
           "plan": {
             "cropName": "${data.cropName}",
             "startDate": "${startDate}",
             "milestones": [ ...detailed milestones... ],
             "totalBudgetEstimate": 0,
             "harvestDate": "YYYY-MM-DD",
             "sellWindow": "...",
             "storageNotes": "..."
           }
         }
         ${milestoneSpec}
         Return only valid JSON.`
      : `Assess current growing status for this farmer who is mid-season:
         - Crop info: ${data.currentCropInfo ?? 'unknown'}
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres
         - Today: ${today}${assessmentText}${forecastBlock}

         Return a JSON plan with the REMAINING stages from today onward and current status:
         {
           "cropName": "...",
           "currentStage": "...",
           "startDate": "${today}",
           "remainingMilestones": [ ...detailed milestones, first one starting today... ],
           "harvestDate": "YYYY-MM-DD",
           "sellWindow": "...",
           "storageNotes": "...",
           "immediateAction": "..."
         }
         ${milestoneSpec}
         Return only valid JSON.`;

    const llmResponse = await chatWithBedrock(
      [{ role: 'user', content: planPrompt }],
      'You are an expert Tamil Nadu agricultural advisor. Return only valid JSON as requested.',
      // Detailed multi-stage plans are large; JSON mode + a high token cap keep
      // the response complete and parseable.
      { json: true, maxTokens: 8000 }
    );

    // JSON mode returns a clean object; fall back to brace extraction otherwise.
    let planData: Record<string, unknown>;
    try {
      planData = JSON.parse(llmResponse);
    } catch {
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      planData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    if (data.farmerState === 'planning_unsure') {
      // Annotate each suggested crop's milestones with the real forecast/alerts.
      if (Array.isArray(planData.suggestedCrops)) {
        planData.suggestedCrops = planData.suggestedCrops.map((c: Record<string, unknown>) => ({
          ...c,
          startDate: c.startDate ?? startDate,
          milestones: annotateMilestonesWithWeather((c.milestones ?? []) as Milestone[], forecast),
        }));
      }
    } else {
      // Normalize the plan (planning_specific nests it under `plan`; mid_grow
      // returns it at the top level), annotate with weather, then persist it.
      const normalized = normalizePlan((planData.plan ?? planData) as Record<string, unknown>, startDate);
      if (normalized) {
        normalized.milestones = annotateMilestonesWithWeather(normalized.milestones, forecast);
        planData.plan = normalized;
        await persistPlan(
          farmer.farmerId,
          normalized,
          data.farmerState === 'mid_grow' ? 'active' : 'planned',
          (planData.currentStage as string) ?? null
        );
      }
    }

    return NextResponse.json({ planData, rawResponse: llmResponse });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Crop plan error:', err);
    return NextResponse.json({ error: 'Plan generation failed' }, { status: 500 });
  }
}
