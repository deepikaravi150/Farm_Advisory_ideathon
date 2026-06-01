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
  locale: z.enum(['en', 'hi', 'ta']).default('en'),
});

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = GeneratePlanSchema.parse(body);

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
         - Today: ${today}

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
         - Today: ${today}

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
         - Today: ${today}

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

    // Save active plan if a specific crop is selected
    if (data.farmerState !== 'planning_unsure' && planData.plan?.cropName) {
      const plan = planData.plan;
      await putItem(Tables.CROP_PLANS, {
        farmer_id: farmer.farmerId,
        plan_id: generateId(),
        crop_name: plan.cropName,
        start_date: today,
        milestones: plan.milestones,
        harvest_date: plan.harvestDate,
        sell_window: plan.sellWindow,
        storage_notes: plan.storageNotes,
        budget_estimate: plan.totalBudgetEstimate,
        status: data.farmerState === 'mid_grow' ? 'active' : 'planned',
        current_stage: planData.currentStage ?? null,
        weather_alerts: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ planData, rawResponse: llmResponse });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Crop plan error:', err);
    return NextResponse.json({ error: 'Plan generation failed' }, { status: 500 });
  }
}
