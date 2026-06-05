import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { chatWithBedrock } from '@/lib/ai/openai';
import { queryItems, putItem, getItem, updateItem, deleteItem, Tables } from '@/lib/aws/dynamodb';
import { generateId, extractCentroid } from '@/lib/utils';
import { get15DayForecast, type ForecastDay } from '@/lib/weather';
import { annotateMilestonesWithWeather, forecastSummaryForPrompt } from '@/lib/crop-plan-weather';
import { formatMemoryForPrompt, type Fact } from '@/lib/memory';
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
    Limit: 20,
  });

  return NextResponse.json(plans);
}

export async function DELETE(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const planId = req.nextUrl.searchParams.get('planId');
  if (!planId) return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });

  try {
    await deleteItem(Tables.CROP_PLANS, {
      farmer_id: farmer.farmerId,
      plan_id: planId,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Crop plan delete error:', err);
    return NextResponse.json({ error: 'Plan delete failed' }, { status: 500 });
  }
}

const GeneratePlanSchema = z.object({
  cropName: z.string().min(1),
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
function normalizePlan(
  p: Record<string, unknown> | undefined | null,
  startDate: string,
  fallbackCropName?: string
): NormalizedPlan | null {
  const cropName = p?.cropName ?? p?.crop_name ?? fallbackCropName;
  if (!p || !cropName) return null;
  return {
    cropName: String(cropName),
    startDate: String(p.startDate ?? p.start_date ?? startDate),
    milestones: (p.milestones ?? p.remainingMilestones ?? []) as Milestone[],
    totalBudgetEstimate: Number(p.totalBudgetEstimate ?? p.budgetEstimate ?? p.budget_estimate ?? 0),
    harvestDate: String(p.harvestDate ?? p.harvest_date ?? ''),
    sellWindow: String(p.sellWindow ?? p.sell_window ?? ''),
    storageNotes: String(p.storageNotes ?? p.storage_notes ?? ''),
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

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatSoilReportContext(soilData: Record<string, unknown> | undefined) {
  if (!soilData) return 'No soil report is available.';

  const micronutrients = soilData.micronutrients && typeof soilData.micronutrients === 'object'
    ? Object.entries(soilData.micronutrients as Record<string, unknown>)
        .map(([name, value]) => `${name}: ${value ?? 'unknown'}`)
        .join(', ')
    : '';
  const keyFindings = Array.isArray(soilData.key_findings)
    ? soilData.key_findings.filter(Boolean).join('; ')
    : '';

  return [
    `pH: ${soilData.ph ?? 'unknown'}`,
    `EC/salinity: ${soilData.electrical_conductivity ?? 'unknown'}`,
    `Organic carbon: ${soilData.organic_carbon ?? 'unknown'}`,
    `Nitrogen: ${soilData.nitrogen ?? 'unknown'}`,
    `Phosphorus: ${soilData.phosphorus ?? 'unknown'}`,
    `Potassium: ${soilData.potassium ?? 'unknown'}`,
    micronutrients ? `Micronutrients: ${micronutrients}` : '',
    soilData.plain_language_summary ? `Farmer-friendly soil summary: ${soilData.plain_language_summary}` : '',
    keyFindings ? `Key soil findings: ${keyFindings}` : '',
    soilData.recommendations ? `Soil recommendations: ${soilData.recommendations}` : '',
  ].filter(Boolean).join('\n');
}

function buildFallbackPlan(
  cropName: string,
  startDate: string,
  profile: Record<string, unknown> | null,
  soilData: Record<string, unknown> | undefined
): NormalizedPlan {
  const acres = Number(profile?.land_area_acres ?? 1) || 1;
  const crop = cropName.trim();
  const soilNote = soilData
    ? `Current soil report details:\n${formatSoilReportContext(soilData)}`
    : 'No soil report is available, so confirm nutrient dose locally before applying fertilizer.';
  const stages = [
    { label: 'Land Preparation', offset: 0, days: 7, cost: 12000, task: `Clear weeds, plough the field, break clods, and level the land for ${crop}. Add well-decomposed farmyard manure and improve drainage based on the field slope. ${soilNote}` },
    { label: 'Seed Selection and Treatment', offset: 7, days: 2, cost: 3500, task: `Buy healthy ${crop} seed from a reliable source. Treat seed with recommended biofertilizer or fungicide before sowing, and keep enough seed for gap filling.` },
    { label: 'Sowing', offset: 9, days: 3, cost: 9000, task: `Sow ${crop} at the right spacing for your local variety. Keep soil moist during germination, avoid sowing before heavy rain, and mark rows clearly for easy weeding.` },
    { label: 'Irrigation and Weed Control', offset: 12, days: 21, cost: 8500, task: `Maintain light, regular irrigation according to soil moisture. Remove weeds early, especially during the first three weeks, so ${crop} does not compete for nutrients.` },
    { label: 'Nutrient and Pest Management', offset: 33, days: 28, cost: 14500, task: `Apply nutrients in split doses based on the soil report and crop growth. Inspect leaves, stems, and flowers twice a week, and use biological or recommended chemical control only when symptoms are seen.` },
    { label: 'Harvesting and Selling', offset: 61, days: 14, cost: 10000, task: `Harvest ${crop} when the crop reaches maturity and moisture is suitable. Dry, grade, and store the produce cleanly before selling during the best local market window.` },
  ];

  const milestones = stages.map((stage, index) => ({
    id: String(index + 1),
    label: stage.label,
    date: addDays(startDate, stage.offset),
    endDate: addDays(startDate, stage.offset + stage.days),
    durationDays: stage.days,
    tasks: stage.task,
    estimatedCost: Math.round(stage.cost * acres),
    weatherRequirement: 'Avoid heavy rain, waterlogging, and strong wind during field operations. Prefer mild weather with workable soil moisture.',
  }));

  return {
    cropName: crop,
    startDate,
    milestones,
    totalBudgetEstimate: milestones.reduce((sum, stage) => sum + stage.estimatedCost, 0),
    harvestDate: addDays(startDate, 75),
    sellWindow: `${addDays(startDate, 76)} to ${addDays(startDate, 90)}`,
    storageNotes: `Store ${crop} in clean, dry bags or containers after proper drying. Keep produce away from moisture and pests.`,
  };
}

async function persistPlan(
  farmerId: string,
  plan: NormalizedPlan,
  status: string,
  currentStage: string | null,
  inputDetails?: Record<string, unknown>,
  // When provided, the existing plan is updated in place (same id) instead of a
  // new copy being created. This is what makes an "edit" stay on the same plan.
  planId?: string
) {
  const alertStages = plan.milestones.filter((m) => m.alert).map((m) => m.label);
  const now = new Date().toISOString();

  // Defaults for a brand-new plan.
  let createdAt = now;
  let effectiveStatus = status;
  let effectiveStage = currentStage;
  let effectiveInputDetails = inputDetails ?? {};
  let activeFrom: string | undefined;

  // Editing an existing plan: keep its id and preserve fields the edit payload
  // doesn't carry (creation time, active status/date, current stage, assessment).
  if (planId) {
    const existing = await getItem(Tables.CROP_PLANS, { farmer_id: farmerId, plan_id: planId });
    if (existing) {
      createdAt = (existing.created_at as string) ?? now;
      effectiveStatus = (existing.status as string) ?? status;
      activeFrom = existing.active_from as string | undefined;
      effectiveStage = currentStage ?? ((existing.current_stage as string | null) ?? null);
      if (!inputDetails || Object.keys(inputDetails).length === 0) {
        effectiveInputDetails = (existing.input_details as Record<string, unknown>) ?? {};
      }
    }
  }

  const item = {
    farmer_id: farmerId,
    plan_id: planId ?? generateId(),
    crop_name: plan.cropName,
    start_date: plan.startDate,
    milestones: plan.milestones,
    harvest_date: plan.harvestDate,
    sell_window: plan.sellWindow,
    storage_notes: plan.storageNotes,
    budget_estimate: plan.totalBudgetEstimate,
    status: effectiveStatus,
    current_stage: effectiveStage,
    input_details: effectiveInputDetails,
    weather_alerts: alertStages,
    active_from: activeFrom, // undefined is stripped by removeUndefinedValues
    created_at: createdAt,
    updated_at: now,
  };
  await putItem(Tables.CROP_PLANS, item);
  return item;
}

const SavePlanSchema = z.object({
  action: z.literal('save'),
  // When present, update this existing plan in place instead of creating a copy.
  planId: z.string().optional(),
  plan: z.object({
    cropName: z.string(),
    startDate: z.string().optional(),
    milestones: z.array(z.any()).default([]),
    totalBudgetEstimate: z.number().default(0),
    harvestDate: z.string().default(''),
    sellWindow: z.string().default(''),
    storageNotes: z.string().default(''),
  }),
  inputDetails: z.record(z.unknown()).optional(),
});

const ActivatePlanSchema = z.object({
  action: z.literal('activate'),
  planId: z.string().min(1),
});

const DeactivatePlanSchema = z.object({
  action: z.literal('deactivate'),
  planId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // Branch: persist a plan the farmer selected from AI suggestions.
    if (body?.action === 'save') {
      const { plan, inputDetails, planId } = SavePlanSchema.parse(body);
      const today = new Date().toISOString().split('T')[0];
      const savedPlan = await persistPlan(
        farmer.farmerId,
        { ...plan, startDate: plan.startDate ?? today } as NormalizedPlan,
        'planned',
        null,
        inputDetails,
        planId
      );
      return NextResponse.json({ success: true, savedPlan });
    }

    if (body?.action === 'activate') {
      const { planId } = ActivatePlanSchema.parse(body);
      const activeFrom = new Date().toISOString().split('T')[0];
      await updateItem({
        TableName: Tables.CROP_PLANS,
        Key: { farmer_id: farmer.farmerId, plan_id: planId },
        UpdateExpression: 'SET #s = :s, active_from = :af, updated_at = :u',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': 'active',
          ':af': activeFrom,
          ':u': new Date().toISOString(),
        },
      });

      return NextResponse.json({ success: true });
    }

    if (body?.action === 'deactivate') {
      const { planId } = DeactivatePlanSchema.parse(body);
      await updateItem({
        TableName: Tables.CROP_PLANS,
        Key: { farmer_id: farmer.farmerId, plan_id: planId },
        UpdateExpression: 'SET #s = :s, updated_at = :u',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': 'planned',
          ':u': new Date().toISOString(),
        },
      });

      return NextResponse.json({ success: true });
    }

    const data = GeneratePlanSchema.parse(body);
    const assessmentText = formatAssessment(data.assessment);
    const outputLanguage =
      data.locale === 'ta' ? 'Tamil' :
      data.locale === 'hi' ? 'Hindi' :
      'English';

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
    const soilContext = formatSoilReportContext(soilData);
    const memoryContext = formatMemoryForPrompt(profile?.memory as Fact[] | undefined);
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
         - Keep all dates consistent with durationDays and the ${startDate} anchor.
         - Keep text farmer-friendly and actionable. Avoid vague tasks like "monitor regularly" unless you say what to check and what action to take.
         - Return JSON only. Do not wrap it in markdown.`;

    const planPrompt = data.farmerState === 'planning_unsure' || data.farmerState === 'planning_specific'
      ? `Validate and create a detailed crop plan for growing ${data.cropName} for a Tamil Nadu farmer:
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres
         - Land type/topography from DB: ${profile?.typography ?? 'general land'}
         - Farmer address from DB: ${profile?.address ?? 'unknown'}
         - Soil report from DB:
${soilContext}
         - Today: ${today}
         - Farmer wants to start on: ${startDate}${assessmentText}${forecastBlock}

         Write every farmer-facing text value in ${outputLanguage}: cropName, suitabilityReason, adjustments, milestone labels, tasks, weatherRequirement, sellWindow, and storageNotes.
         Keep JSON keys, dates, IDs, numbers, and currency values in English/standard format.

         First check whether ${data.cropName} can realistically grow in this farmer's area/land/soil using the DB details above.
         If suitable, create the plan. If only conditionally suitable, still create the plan but include required adjustments.
         Use the soil report to customize land preparation, organic matter improvement, fertilizer planning, micronutrient correction, irrigation/salinity cautions, nutrient management, and pest/disease prevention stages. Do not invent soil values that are not in the report.
         Return JSON:
         {
           "suitable": true,
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
         - Selected crop: ${data.cropName}
         - Crop info: ${data.currentCropInfo ?? 'unknown'}
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres
         - Land type/topography from DB: ${profile?.typography ?? 'general land'}
         - Farmer address from DB: ${profile?.address ?? 'unknown'}
         - Soil report from DB:
${soilContext}
         - Today: ${today}${assessmentText}${forecastBlock}

         Write every farmer-facing text value in ${outputLanguage}: cropName, currentStage, milestone labels, tasks, weatherRequirement, sellWindow, storageNotes, and immediateAction.
         Keep JSON keys, dates, IDs, numbers, and currency values in English/standard format.

         First check whether ${data.cropName} can realistically grow in this farmer's area/land/soil using the DB details above.
         If suitable, create a remaining-stage plan for the selected crop. If conditionally suitable, include corrective adjustments in the tasks.
         Use the soil report to customize immediate action, organic matter improvement, fertilizer planning, micronutrient correction, irrigation/salinity cautions, nutrient management, and pest/disease prevention stages. Do not invent soil values that are not in the report.

         Return a JSON plan with the REMAINING stages from today onward and current status:
         {
           "cropName": "${data.cropName}",
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

    let llmResponse = '';
    let planData: Record<string, unknown>;
    try {
      llmResponse = await chatWithBedrock(
        [{ role: 'user', content: planPrompt }],
        `You are FarmAdvisor, an expert Tamil Nadu agricultural planner.
Return one valid JSON object only.
Use the farmer profile, soil data, assessment, and forecast exactly as provided.
Write farmer-facing text in ${outputLanguage}.
Do not invent unavailable soil values, land details, market prices, or weather data.
Make the plan practical for a farmer to execute in the field.${memoryContext ? `\n\n${memoryContext}\n(Use these known facts about the farmer to tailor crop choice, inputs, and schedule.)` : ''}`,
        // Detailed multi-stage plans are large; JSON mode + a high token cap keep
        // the response complete and parseable.
        { json: true, maxTokens: 7000 }
      );

      // JSON mode returns a clean object; fall back to brace extraction otherwise.
      try {
        planData = JSON.parse(llmResponse);
      } catch {
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
        planData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      }
    } catch (err) {
      console.error('Crop plan AI generation failed, using fallback plan:', err);
      planData = {
        suitable: true,
        suitabilityReason: `${data.cropName} can be planned using the farmer profile and soil details available in the database.`,
        adjustments: 'Confirm exact seed variety and fertilizer dose with local advisory before field application.',
        plan: buildFallbackPlan(data.cropName, startDate, profile, soilData),
      };
    }

    const suggestedCrops = Array.isArray(planData.suggestedCrops) ? planData.suggestedCrops : [];
    const matchingSuggestion = suggestedCrops.find((crop) => {
      if (!crop || typeof crop !== 'object') return false;
      const candidate = (crop as Record<string, unknown>).cropName ?? (crop as Record<string, unknown>).crop_name;
      return String(candidate ?? '').toLowerCase() === data.cropName.toLowerCase();
    }) as Record<string, unknown> | undefined;
    let rawPlan = (planData.plan ?? matchingSuggestion ?? planData) as Record<string, unknown>;
    if (!rawPlan.milestones && !rawPlan.remainingMilestones) {
      rawPlan = buildFallbackPlan(data.cropName, startDate, profile, soilData) as unknown as Record<string, unknown>;
      planData.plan = rawPlan;
    }
    const normalized = normalizePlan(rawPlan, startDate, data.cropName);
    if (normalized) {
      normalized.milestones = annotateMilestonesWithWeather(normalized.milestones, forecast);
      planData.plan = normalized;
      const inputDetails = {
        farmerState: data.farmerState,
        selectedCrop: data.cropName,
        currentCropInfo: data.currentCropInfo ?? '',
        assessment: data.assessment ?? {},
        startDate,
      };
      planData.inputDetails = inputDetails;
      const savedPlan = await persistPlan(
        farmer.farmerId,
        normalized,
        data.farmerState === 'mid_grow' ? 'active' : 'planned',
        (planData.currentStage as string) ?? null,
        inputDetails
      );
      planData.savedPlan = savedPlan;
    }

    return NextResponse.json({ planData, rawResponse: llmResponse });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Crop plan error:', err);
    return NextResponse.json({ error: 'Plan generation failed' }, { status: 500 });
  }
}
