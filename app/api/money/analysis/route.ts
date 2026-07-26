import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { listEntries } from '@/lib/money/ledger';
import { computeAnalysis } from '@/lib/money/analysis';

// Calls the LLM for the financial narrative; allow up to 60s.
export const maxDuration = 60;

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

/**
 * GET /api/money/analysis?locale=en|hi|ta — full financial analysis from the
 * farmer's ledger: profit/loss, expense breakdown, per-crop P&L, sale-vs-market
 * "scam" check, loan-vs-spend, plus a localized AI narrative (with fallback).
 */
export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const localeParam = req.nextUrl.searchParams.get('locale') ?? 'en';
  const locale = (['en', 'hi', 'ta'].includes(localeParam) ? localeParam : 'en') as 'en' | 'hi' | 'ta';

  const entries = await listEntries(farmer.farmerId);
  const analysis = await computeAnalysis(entries, { locale });
  return NextResponse.json(analysis);
}
