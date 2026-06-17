import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getItem, Tables } from '@/lib/aws/dynamodb';
import { getActiveCropPlan } from '@/lib/daily-sms';
import { chatWithBedrock } from '@/lib/ai/openai';

// Calls the LLM for the profit outlook; allow up to 60s on Vercel.
export const maxDuration = 60;

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

function languageName(locale: string) {
  return locale === 'ta' ? 'Tamil' : locale === 'hi' ? 'Hindi' : 'English';
}

interface Milestone { label?: string; estimatedCost?: number }

/**
 * Profit outlook for the Money tab: combines the active plan's expenses with the
 * current market price into an AI-estimated revenue/profit range plus tips.
 * Always degrades to a deterministic estimate so the tab never breaks.
 */
export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const localeParam = req.nextUrl.searchParams.get('locale') ?? 'en';
  const locale = ['en', 'hi', 'ta'].includes(localeParam) ? localeParam : 'en';
  const marketModal = Number(req.nextUrl.searchParams.get('marketModal') ?? '') || 0;

  const [profile, plan] = await Promise.all([
    getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId }),
    getActiveCropPlan(farmer.farmerId),
  ]);

  if (!plan) return NextResponse.json({ hasPlan: false });

  const milestones = (plan.milestones ?? []) as Milestone[];
  const breakdown = milestones
    .map((m) => ({ label: m.label ?? 'Stage', cost: Number(m.estimatedCost ?? 0) }))
    .filter((m) => m.cost > 0);
  const expense = Number(plan.budget_estimate ?? 0) || breakdown.reduce((s, m) => s + m.cost, 0);
  const acres = Number(profile?.land_area_acres ?? 1) || 1;
  const crop = String(plan.crop_name ?? 'your crop');

  // Rule-based fallback so the card always has numbers.
  const fallbackProfit = Math.round(expense * 0.6);
  const fallback = {
    estimatedRevenue: `~₹${Math.round(expense * 1.6).toLocaleString('en-IN')}`,
    projectedProfit: `~₹${fallbackProfit.toLocaleString('en-IN')}`,
    margin: 'Rough estimate — confirm with your local market.',
    tips: [
      'Sell graded, well-dried produce to fetch a better price.',
      'Track the daily market rate and sell during the best window.',
    ],
  };

  let outlook = fallback;
  try {
    const raw = await chatWithBedrock(
      [{
        role: 'user',
        content: `Estimate the money picture for a Tamil Nadu farmer.
- Crop: ${crop}
- Land: ${acres} acres
- Total planned expense: ₹${expense}
- Current market modal price: ${marketModal ? `about ₹${marketModal} per quintal` : 'unknown'}

Return ONLY JSON:
{
  "estimatedRevenue": "approx revenue range for this land size, e.g. ₹45,000–₹60,000",
  "projectedProfit": "approx profit range (revenue minus the expense above)",
  "margin": "one short sentence on the profit outlook, clearly an estimate",
  "tips": ["one practical tip to be more profitable", "a second tip"]
}
Write all text values in ${languageName(locale)}. Keep currency digits standard. Return only valid JSON.`,
      }],
      'You are FarmAdvisor, a Tamil Nadu farm economics helper. Return only valid JSON with realistic, conservative estimates.',
      { json: true, maxTokens: 500 },
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      outlook = {
        estimatedRevenue: String(parsed.estimatedRevenue ?? fallback.estimatedRevenue),
        projectedProfit: String(parsed.projectedProfit ?? fallback.projectedProfit),
        margin: String(parsed.margin ?? fallback.margin),
        tips: Array.isArray(parsed.tips) && parsed.tips.length ? parsed.tips.slice(0, 3).map(String) : fallback.tips,
      };
    }
  } catch (err) {
    console.error('Money outlook generation failed:', err);
  }

  return NextResponse.json({
    hasPlan: true,
    crop,
    expense,
    breakdown,
    ...outlook,
  });
}
