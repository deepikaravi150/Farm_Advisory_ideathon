import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

/**
 * Daily mandi (market) prices from the Government of India open-data portal
 * (Agmarknet — "Variety-wise Daily Market Prices of Various Commodities").
 *
 * Set DATA_GOV_IN_API_KEY in the environment. The public sample key below works
 * for light testing but is rate-limited and shared, so a real key is recommended.
 */
const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const SAMPLE_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b';

interface AgmarkRecord {
  state?: string;
  district?: string;
  market?: string;
  commodity?: string;
  variety?: string;
  arrival_date?: string; // DD/MM/YYYY
  min_price?: string;
  max_price?: string;
  modal_price?: string;
}

interface MarketPrice {
  market: string;
  district: string;
  variety: string;
  min: number;
  max: number;
  modal: number;
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** DD/MM/YYYY → sortable YYYYMMDD number (0 when unparseable). */
function dateKey(d?: string): number {
  if (!d) return 0;
  const [dd, mm, yyyy] = d.split('/');
  if (!yyyy) return 0;
  return Number(`${yyyy}${mm?.padStart(2, '0')}${dd?.padStart(2, '0')}`);
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const commodity = (req.nextUrl.searchParams.get('commodity') ?? '').trim();
  const state = (req.nextUrl.searchParams.get('state') ?? 'Tamil Nadu').trim();
  if (!commodity) return NextResponse.json({ available: false, reason: 'no_commodity' });

  const apiKey = process.env.DATA_GOV_IN_API_KEY ?? SAMPLE_KEY;

  const url =
    `https://api.data.gov.in/resource/${RESOURCE_ID}` +
    `?api-key=${apiKey}&format=json&limit=200` +
    `&filters[state]=${encodeURIComponent(state)}` +
    `&filters[commodity]=${encodeURIComponent(commodity)}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json({ available: false, reason: 'api_error', status: res.status });
    }
    const data = await res.json();
    const records: AgmarkRecord[] = Array.isArray(data.records) ? data.records : [];
    if (!records.length) {
      return NextResponse.json({ available: false, reason: 'no_data', commodity, state });
    }

    // Group by date so we can show the latest snapshot and compute a trend.
    const byDate = new Map<number, AgmarkRecord[]>();
    for (const r of records) {
      const key = dateKey(r.arrival_date);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(r);
    }
    const sortedDates = [...byDate.keys()].sort((a, b) => b - a);
    const latestDate = sortedDates[0];
    const latestRecords = byDate.get(latestDate) ?? records;

    const markets: MarketPrice[] = latestRecords
      .map((r) => ({
        market: r.market ?? '',
        district: r.district ?? '',
        variety: r.variety ?? '',
        min: num(r.min_price),
        max: num(r.max_price),
        modal: num(r.modal_price),
      }))
      .filter((m) => m.modal > 0)
      .sort((a, b) => b.modal - a.modal)
      .slice(0, 6);

    if (!markets.length) {
      return NextResponse.json({ available: false, reason: 'no_data', commodity, state });
    }

    const avgModal = Math.round(markets.reduce((s, m) => s + m.modal, 0) / markets.length);

    // Trend: compare latest-day average vs the previous day's average, if present.
    let trend: 'up' | 'down' | 'flat' | null = null;
    if (sortedDates.length > 1) {
      const prev = byDate.get(sortedDates[1]) ?? [];
      const prevModals = prev.map((r) => num(r.modal_price)).filter((n) => n > 0);
      if (prevModals.length) {
        const prevAvg = prevModals.reduce((s, n) => s + n, 0) / prevModals.length;
        const diff = avgModal - prevAvg;
        trend = Math.abs(diff) < prevAvg * 0.02 ? 'flat' : diff > 0 ? 'up' : 'down';
      }
    }

    return NextResponse.json({
      available: true,
      commodity,
      state,
      date: latestRecords[0]?.arrival_date ?? null,
      avgModal,
      trend,
      markets,
    });
  } catch (err) {
    console.error('Market prices error:', err);
    return NextResponse.json({ available: false, reason: 'api_error' });
  }
}
