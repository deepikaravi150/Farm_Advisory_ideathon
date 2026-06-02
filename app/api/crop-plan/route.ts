import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { chatWithBedrock } from '@/lib/ai/openai';
import { queryItems, putItem, updateItem, getItem, Tables } from '@/lib/aws/dynamodb';
import { generateId } from '@/lib/utils';

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
function normalizePlan(p: Record<string, unknown> | undefined | null) {
  if (!p || !p.cropName) return null;
  return {
    cropName: String(p.cropName),
    milestones: (p.milestones ?? p.remainingMilestones ?? []) as unknown[],
    totalBudgetEstimate: Number(p.totalBudgetEstimate ?? 0),
    harvestDate: String(p.harvestDate ?? ''),
    sellWindow: String(p.sellWindow ?? ''),
    storageNotes: String(p.storageNotes ?? ''),
  };
}

interface NormalizedPlan {
  cropName: string;
  milestones: unknown[];
  totalBudgetEstimate: number;
  harvestDate: string;
  sellWindow: string;
  storageNotes: string;
}

async function persistPlan(
  farmerId: string,
  plan: NormalizedPlan,
  status: string,
  currentStage: string | null,
  today: string
) {
  await putItem(Tables.CROP_PLANS, {
    farmer_id: farmerId,
    plan_id: generateId(),
    crop_name: plan.cropName,
    start_date: today,
    milestones: plan.milestones,
    harvest_date: plan.harvestDate,
    sell_window: plan.sellWindow,
    storage_notes: plan.storageNotes,
    budget_estimate: plan.totalBudgetEstimate,
    status,
    current_stage: currentStage,
    weather_alerts: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

const SavePlanSchema = z.object({
  action: z.literal('save'),
  plan: z.object({
    cropName: z.string(),
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
      await persistPlan(farmer.farmerId, plan, 'planned', null, today);
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

    const planPrompt = data.farmerState === 'planning_unsure'
      ? `Suggest the top 3 best crops to grow for a Tamil Nadu farmer with the following profile:
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres, ${profile?.typography ?? 'general land'}
         - Soil: ${soilData ? `pH ${soilData.ph}, N:${soilData.nitrogen} P:${soilData.phosphorus} K:${soilData.potassium}` : 'no soil data'}
         - Today: ${today}${assessmentText}

         For each crop, provide a detailed JSON plan with this structure:
         {
           "suggestedCrops": [
             {
               "cropName": "...",
               "reason": "...",
               "season": "...",
               "estimatedRevenue": "...",
               "milestones": [
                 {"id": "1", "label": "Land Preparation", "date": "YYYY-MM-DD", "durationDays": 7, "tasks": "...", "estimatedCost": 0, "weatherRequirement": "..."},
                 {"id": "2", "label": "Sowing", "date": "YYYY-MM-DD", "durationDays": 3, "tasks": "...", "estimatedCost": 0, "weatherRequirement": "..."},
                 {"id": "3", "label": "First Fertilization", "date": "YYYY-MM-DD", "durationDays": 1, "tasks": "...", "estimatedCost": 0, "weatherRequirement": "..."},
                 {"id": "4", "label": "Irrigation Setup", "date": "YYYY-MM-DD", "durationDays": 2, "tasks": "...", "estimatedCost": 0, "weatherRequirement": "..."},
                 {"id": "5", "label": "Pest/Disease Check", "date": "YYYY-MM-DD", "durationDays": 1, "tasks": "...", "estimatedCost": 0, "weatherRequirement": "..."},
                 {"id": "6", "label": "Harvest", "date": "YYYY-MM-DD", "durationDays": 5, "tasks": "...", "estimatedCost": 0, "weatherRequirement": "..."},
                 {"id": "7", "label": "Storage/Sell", "date": "YYYY-MM-DD", "durationDays": 3, "tasks": "...", "estimatedCost": 0, "weatherRequirement": "..."}
               ],
               "totalBudgetEstimate": 0,
               "harvestDate": "YYYY-MM-DD",
               "sellWindow": "...",
               "storageNotes": "..."
             }
           ]
         }
         Return only valid JSON.`
      : data.farmerState === 'planning_specific'
      ? `Validate and create a detailed crop plan for growing ${data.cropName} for a Tamil Nadu farmer:
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres
         - Soil: ${soilData ? `pH ${soilData.ph}, N:${soilData.nitrogen} P:${soilData.phosphorus} K:${soilData.potassium}` : 'no soil data'}
         - Today: ${today}${assessmentText}

         Assess if ${data.cropName} is suitable. Return JSON:
         {
           "suitable": true/false,
           "suitabilityReason": "...",
           "adjustments": "...",
           "plan": {
             "cropName": "${data.cropName}",
             "milestones": [...same structure as above...],
             "totalBudgetEstimate": 0,
             "harvestDate": "YYYY-MM-DD",
             "sellWindow": "...",
             "storageNotes": "..."
           }
         }
         Return only valid JSON.`
      : `Assess current growing status for this farmer who is mid-season:
         - Crop info: ${data.currentCropInfo ?? 'unknown'}
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres
         - Today: ${today}${assessmentText}

         Return a JSON plan with remaining milestones and current status:
         {
           "cropName": "...",
           "currentStage": "...",
           "remainingMilestones": [...],
           "harvestDate": "YYYY-MM-DD",
           "sellWindow": "...",
           "storageNotes": "...",
           "immediateAction": "..."
         }
         Return only valid JSON.`;

    const llmResponse = await chatWithBedrock(
      [{ role: 'user', content: planPrompt }],
      'You are an expert Tamil Nadu agricultural advisor. Return only valid JSON as requested.'
    );

    // Extract JSON from response
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    const planData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // For non-suggestion flows, normalize the plan (planning_specific nests it
    // under `plan`; mid_grow returns it at the top level) and persist it so it
    // reappears on the farmer's next visit.
    if (data.farmerState !== 'planning_unsure') {
      const normalized = normalizePlan(planData.plan ?? planData);
      if (normalized) {
        // Expose a consistent shape to the client regardless of source flow.
        planData.plan = normalized;
        await persistPlan(
          farmer.farmerId,
          normalized,
          data.farmerState === 'mid_grow' ? 'active' : 'planned',
          planData.currentStage ?? null,
          today
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
