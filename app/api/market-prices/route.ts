import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const SAMPLE_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b';

interface AgmarkRecord {
  state?: string;
  district?: string;
  market?: string;
  commodity?: string;
  variety?: string;
  arrival_date?: string;
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

const COMMODITY_ALIASES: Record<string, string[]> = {
  chilli: ['Green Chilli', 'Chilli', 'Dry Chillies'],
  chili: ['Green Chilli', 'Chilli', 'Dry Chillies'],
  rice: ['Paddy(Dhan)', 'Paddy', 'Rice'],
  paddy: ['Paddy(Dhan)', 'Paddy'],
  brinjal: ['Brinjal'],
  eggplant: ['Brinjal'],
  banana: ['Banana'],
  tomato: ['Tomato'],
  onion: ['Onion'],
};

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function commodityCandidates(commodity: string) {
  const normalized = commodity.trim().toLowerCase();
  const aliases = COMMODITY_ALIASES[normalized] ?? [];
  return [...new Set([commodity.trim(), ...aliases].filter(Boolean))];
}

function buildUrl(apiKey: string, state: string, commodity?: string, limit = 200) {
  const commodityFilter = commodity ? `&filters[commodity]=${encodeURIComponent(commodity)}` : '';
  return (
    `https://api.data.gov.in/resource/${RESOURCE_ID}` +
    `?api-key=${apiKey}&format=json&limit=${limit}` +
    `&filters[state]=${encodeURIComponent(state)}` +
    commodityFilter
  );
}

async function fetchRecords(apiKey: string, state: string, commodity: string) {
  for (const candidate of commodityCandidates(commodity)) {
    const res = await fetch(buildUrl(apiKey, state, candidate), { next: { revalidate: 3600 } });
    if (!res.ok) return { records: [], status: res.status, commodity: candidate };
    const data = await res.json();
    const records: AgmarkRecord[] = Array.isArray(data.records) ? data.records : [];
    if (records.length) return { records, commodity: candidate };
  }

  const broader = await fetch(buildUrl(apiKey, state, undefined, 1000), { next: { revalidate: 3600 } });
  if (!broader.ok) return { records: [], status: broader.status, commodity };

  const data = await broader.json();
  const allRecords: AgmarkRecord[] = Array.isArray(data.records) ? data.records : [];
  const needles = commodityCandidates(commodity).map((c) => c.toLowerCase());
  const records = allRecords.filter((record) => {
    const name = String(record.commodity ?? '').toLowerCase();
    return needles.some((needle) => name.includes(needle) || needle.includes(name));
  });

  return { records, commodity: records[0]?.commodity ?? commodity };
}

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

  const apiKey = process.env.DATA_GOV_IN_API_KEY?.trim() || SAMPLE_KEY;

  try {
    const result = await fetchRecords(apiKey, state, commodity);
    if (result.status) {
      return NextResponse.json({ available: false, reason: 'api_error', status: result.status });
    }

    const records = result.records;
    if (!records.length) {
      return NextResponse.json({ available: false, reason: 'no_data', commodity, state });
    }

    const byDate = new Map<number, AgmarkRecord[]>();
    for (const record of records) {
      const key = dateKey(record.arrival_date);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(record);
    }

    const sortedDates = [...byDate.keys()].sort((a, b) => b - a);
    const latestDate = sortedDates[0];
    const latestRecords = byDate.get(latestDate) ?? records;

    const markets: MarketPrice[] = latestRecords
      .map((record) => ({
        market: record.market ?? '',
        district: record.district ?? '',
        variety: record.variety ?? '',
        min: num(record.min_price),
        max: num(record.max_price),
        modal: num(record.modal_price),
      }))
      .filter((market) => market.modal > 0)
      .sort((a, b) => b.modal - a.modal)
      .slice(0, 6);

    if (!markets.length) {
      return NextResponse.json({ available: false, reason: 'no_data', commodity, state });
    }

    const avgModal = Math.round(markets.reduce((sum, market) => sum + market.modal, 0) / markets.length);

    let trend: 'up' | 'down' | 'flat' | null = null;
    if (sortedDates.length > 1) {
      const prev = byDate.get(sortedDates[1]) ?? [];
      const prevModals = prev.map((record) => num(record.modal_price)).filter((n) => n > 0);
      if (prevModals.length) {
        const prevAvg = prevModals.reduce((sum, n) => sum + n, 0) / prevModals.length;
        const diff = avgModal - prevAvg;
        trend = Math.abs(diff) < prevAvg * 0.02 ? 'flat' : diff > 0 ? 'up' : 'down';
      }
    }

    return NextResponse.json({
      available: true,
      commodity: result.commodity,
      state,
      date: latestRecords[0]?.arrival_date ?? null,
      avgModal,
      trend,
      markets,
      source: 'data.gov.in',
    });
  } catch (err) {
    console.error('Market prices error:', err);
    return NextResponse.json({ available: false, reason: 'api_error' });
  }
}
