import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { chatWithBedrock, type Message } from '@/lib/ai/openai';
import { getItem, queryItems, Tables } from '@/lib/aws/dynamodb';
import { extractCentroid } from '@/lib/utils';
import { get15DayForecast, type ForecastDay } from '@/lib/weather';
import { annotateMilestonesWithWeather, forecastSummaryForPrompt } from '@/lib/crop-plan-weather';
import type { CropPlan, Milestone } from '@/lib/types/crop-plan';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

function formatSoilReportContext(soilData: Record<string, unknown> | undefined) {
  if (!soilData) return 'No soil report available.';

  const micronutrients = soilData.micronutrients && typeof soilData.micronutrients === 'object'
    ? Object.entries(soilData.micronutrients as Record<string, unknown>)
        .map(([name, value]) => `${name}: ${value ?? 'unknown'}`)
        .join(', ')
    : '';
  const keyFindings = Array.isArray(soilData.key_findings)
    ? soilData.key_findings.filter(Boolean).join('; ')
    : '';

  return [
    'Soil Report (latest):',
    `- pH: ${soilData.ph ?? 'unknown'}`,
    `- EC/salinity: ${soilData.electrical_conductivity ?? 'unknown'}`,
    `- Organic carbon: ${soilData.organic_carbon ?? 'unknown'}`,
    `- Nitrogen: ${soilData.nitrogen ?? 'unknown'}, Phosphorus: ${soilData.phosphorus ?? 'unknown'}, Potassium: ${soilData.potassium ?? 'unknown'}`,
    micronutrients ? `- Micronutrients: ${micronutrients}` : '',
    soilData.plain_language_summary ? `- Farmer-friendly summary: ${soilData.plain_language_summary}` : '',
    keyFindings ? `- Key findings: ${keyFindings}` : '',
    soilData.recommendations ? `- Recommendations: ${soilData.recommendations}` : '',
  ].filter(Boolean).join('\n');
}

const PlanChatSchema = z.object({
  message: z.string().min(1),
  locale: z.enum(['en', 'hi', 'ta']).default('en'),
  plan: z.object({
    cropName: z.string(),
    startDate: z.string().optional(),
    milestones: z.array(z.any()).default([]),
    totalBudgetEstimate: z.number().default(0),
    harvestDate: z.string().default(''),
    sellWindow: z.string().default(''),
    storageNotes: z.string().default(''),
  }),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),
});

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { message, locale, plan, history } = PlanChatSchema.parse(await req.json());

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
    let forecast: ForecastDay[] = [];
    try {
      const coords = profile?.land_coordinates as Array<{ lat: number; lng: number }> | undefined;
      const { lat, lng } = coords?.length ? extractCentroid(coords) : { lat: 13.0827, lng: 80.2707 };
      forecast = await get15DayForecast(lat, lng);
    } catch (e) {
      console.error('Plan-chat forecast fetch failed:', e);
    }

    const languageInstruction =
      locale === 'ta' ? 'Write the "reply" field in Tamil.' :
      locale === 'hi' ? 'Write the "reply" field in Hindi.' :
      'Write the "reply" field in English.';

    const systemPrompt = `You are FarmAdvisor, an expert Tamil Nadu agricultural advisor helping a farmer refine an existing crop plan through chat.

Goal:
- Answer quickly and clearly.
- If the farmer asks for a plan change, return the complete updated plan, not only the changed stage.
- If the request is unsafe, unclear, or missing one critical detail, explain briefly in "reply" and keep "updatedPlan" as null unless a safe update is still possible.

The farmer's CURRENT plan (JSON):
${JSON.stringify({ ...plan, milestones: plan.milestones }, null, 2)}

${formatSoilReportContext(soilData)}

${forecast.length ? `16-day weather forecast for the farmer's land:\n${forecastSummaryForPrompt(forecast)}\n` : ''}
The farmer will ask questions or request changes (shift dates, add/remove/reorder stages, change crop, adjust costs or tasks, etc.).

Respond with ONLY a valid JSON object:
{
  "reply": "a short, friendly explanation of your answer or the change you are proposing",
  "updatedPlan": null OR a COMPLETE updated plan object {cropName, startDate, milestones:[{id,label,date,endDate,durationDays,tasks,estimatedCost,weatherRequirement}], totalBudgetEstimate, harvestDate, sellWindow, storageNotes}
}
Rules:
- Set "updatedPlan" to null when the farmer is only asking a question (no change needed).
- When proposing a change, return the FULL plan with the changes applied (not a diff). Keep stage dates contiguous and consistent with durationDays.
- Keep every stage's "tasks" detailed and actionable, with specific field actions, timing, inputs, and cautions where relevant.
- Use the latest soil report for fertilizer, micronutrient, organic matter, salinity/EC, pH, and irrigation-related advice. If the farmer requests a plan update, reflect relevant soil report findings in the updatedPlan tasks.
- Do not invent unavailable soil values, market prices, government rules, or weather data.
- Return JSON only. No markdown, comments, or extra text.
- ${languageInstruction} Keep the JSON keys and dates in English.`;

    const messages: Message[] = [...history, { role: 'user', content: message }];
    const raw = await chatWithBedrock(messages, systemPrompt, { json: true, maxTokens: 6000 });

    let parsed: { reply?: string; updatedPlan?: Record<string, unknown> | null };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { reply: raw, updatedPlan: null };
    }

    let updatedPlan: CropPlan | null = null;
    if (parsed.updatedPlan && parsed.updatedPlan.cropName) {
      const up = parsed.updatedPlan;
      updatedPlan = {
        cropName: String(up.cropName),
        startDate: String(up.startDate ?? plan.startDate ?? ''),
        milestones: annotateMilestonesWithWeather((up.milestones ?? []) as Milestone[], forecast),
        totalBudgetEstimate: Number(up.totalBudgetEstimate ?? 0),
        harvestDate: String(up.harvestDate ?? ''),
        sellWindow: String(up.sellWindow ?? ''),
        storageNotes: String(up.storageNotes ?? ''),
      };
    }

    return NextResponse.json({ reply: parsed.reply ?? '', updatedPlan, locale });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Plan chat error:', err);
    return NextResponse.json({ error: 'Plan chat failed' }, { status: 500 });
  }
}
