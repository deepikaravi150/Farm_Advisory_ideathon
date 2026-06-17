'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { IndianRupee, TrendingUp, TrendingDown, Minus, Wallet, Sprout, Lightbulb, Loader2 } from 'lucide-react';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';

interface Market {
  market: string;
  district: string;
  variety: string;
  min: number;
  max: number;
  modal: number;
}
interface MarketResp {
  available: boolean;
  commodity?: string;
  avgModal?: number;
  trend?: 'up' | 'down' | 'flat' | null;
  date?: string | null;
  markets?: Market[];
}
interface MoneyResp {
  hasPlan: boolean;
  crop?: string;
  expense?: number;
  breakdown?: { label: string; cost: number }[];
  estimatedRevenue?: string;
  projectedProfit?: string;
  margin?: string;
  tips?: string[];
}

function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function MoneyView({ hasPlan, cropName, marketCommodity }: { hasPlan: boolean; cropName: string; marketCommodity: string }) {
  const router = useRouter();
  const locale = useLocale();
  const [market, setMarket] = useState<MarketResp | null>(null);
  const [money, setMoney] = useState<MoneyResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasPlan) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      let avgModal = 0;
      try {
        if (marketCommodity) {
          const mRes = await fetch(`/api/market-prices?commodity=${encodeURIComponent(marketCommodity)}`);
          const mData: MarketResp = await mRes.json();
          if (!cancelled) setMarket(mData);
          if (mData.available && mData.avgModal) avgModal = mData.avgModal;
        }
      } catch { /* market optional */ }
      try {
        const res = await fetch(`/api/money?locale=${locale}&marketModal=${avgModal}`);
        const data: MoneyResp = await res.json();
        if (!cancelled) setMoney(data);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [hasPlan, marketCommodity, locale]);

  if (!hasPlan) {
    return (
      <div className="px-4 pb-28 pt-5">
        <Header />
        <div className="mt-6 rounded-2xl border border-dashed border-brand-300 bg-white p-8 text-center">
          <Sprout className="mx-auto h-9 w-9 text-brand-500" />
          <h2 className="mt-2 font-semibold text-gray-900">No active plan</h2>
          <p className="mt-1 text-sm text-gray-500">Create a crop plan to see prices, budget and profit.</p>
          <button onClick={() => router.push('/plan')} className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            Build my crop plan
          </button>
        </div>
      </div>
    );
  }

  const TrendIcon = market?.trend === 'up' ? TrendingUp : market?.trend === 'down' ? TrendingDown : Minus;
  const trendColor = market?.trend === 'up' ? 'text-emerald-600' : market?.trend === 'down' ? 'text-red-500' : 'text-gray-400';
  const maxCost = money?.breakdown?.reduce((m, b) => Math.max(m, b.cost), 0) ?? 0;

  return (
    <div className="px-4 pb-28 pt-5">
      <Header />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Profit outlook */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-brand-100">
              <TrendingUp className="h-3.5 w-3.5" /> Profit outlook for {money?.crop ?? cropName} (estimate)
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Expense" value={money?.expense ? rupee(money.expense) : '—'} />
              <Stat label="Revenue" value={money?.estimatedRevenue ?? '—'} />
              <Stat label="Profit" value={money?.projectedProfit ?? '—'} highlight />
            </div>
            {money?.margin && <p className="mt-3 text-xs text-brand-50">{money.margin}</p>}
          </div>

          {/* Market price */}
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <IndianRupee className="h-4 w-4 text-brand-600" /> Market price
              </h2>
              {market?.available && market.avgModal ? (
                <span className={`flex items-center gap-1 text-sm font-bold ${trendColor}`}>
                  <TrendIcon className="h-4 w-4" /> {rupee(market.avgModal)}/qtl
                </span>
              ) : null}
            </div>
            {market?.available && market.markets?.length ? (
              <ul className="mt-3 space-y-2">
                {market.markets.slice(0, 4).map((m, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-800">{m.market || m.district}</span>
                      <span className="block truncate text-xs text-gray-400">{m.variety || m.district}</span>
                    </span>
                    <span className="ml-3 shrink-0 font-semibold text-gray-700">{rupee(m.modal)}</span>
                  </li>
                ))}
                {market.date && <p className="pt-1 text-[11px] text-gray-400">Source: data.gov.in · {market.date}</p>}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Live price not available for this crop right now.</p>
            )}
          </section>

          {/* Expense breakdown */}
          {money?.breakdown?.length ? (
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <Wallet className="h-4 w-4 text-brand-600" /> Where the money goes
              </h2>
              <ul className="space-y-2.5">
                {money.breakdown.map((b, i) => (
                  <li key={i}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate text-gray-700">{b.label}</span>
                      <span className="ml-2 shrink-0 font-medium text-gray-800">{rupee(b.cost)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${maxCost ? Math.round((b.cost / maxCost) * 100) : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-semibold text-gray-900">
                <span>Total</span><span>{rupee(money.expense ?? 0)}</span>
              </div>
            </section>
          ) : null}

          {/* Tips */}
          {money?.tips?.length ? (
            <section className="rounded-2xl bg-earth-50 p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-earth-800">
                <Lightbulb className="h-4 w-4" /> Be more profitable
              </h2>
              <ul className="space-y-1.5">
                {money.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-sm text-earth-900">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-earth-500" /> {tip}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <IndianRupee className="h-5 w-5 text-brand-600" /> Money
        </h1>
        <p className="text-sm text-gray-500">Prices, budget &amp; profit.</p>
      </div>
      <LanguageSwitcher />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-2 ${highlight ? 'bg-white/20' : 'bg-white/10'}`}>
      <div className="text-[11px] text-brand-100">{label}</div>
      <div className="mt-0.5 text-sm font-bold leading-tight">{value}</div>
    </div>
  );
}
