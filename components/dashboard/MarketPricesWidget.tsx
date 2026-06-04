'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { IndianRupee, TrendingUp, TrendingDown, Minus, Search, Loader2 } from 'lucide-react';

interface MarketPrice {
  market: string;
  district: string;
  variety: string;
  min: number;
  max: number;
  modal: number;
}

interface PriceResponse {
  available: boolean;
  reason?: string;
  commodity?: string;
  state?: string;
  date?: string | null;
  avgModal?: number;
  trend?: 'up' | 'down' | 'flat' | null;
  markets?: MarketPrice[];
}

interface Props {
  defaultCommodity?: string;
  state?: string;
}

const QUICK_PICKS = ['Tomato', 'Onion', 'Rice', 'Brinjal', 'Banana'];

export default function MarketPricesWidget({ defaultCommodity, state = 'Tamil Nadu' }: Props) {
  const locale = useLocale();
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);

  const initial = (defaultCommodity ?? 'Tomato').trim();
  const [commodity, setCommodity] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [data, setData] = useState<PriceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((c: string) => {
    if (!c.trim()) return;
    setLoading(true);
    fetch(`/api/market-prices?commodity=${encodeURIComponent(c)}&state=${encodeURIComponent(state)}`)
      .then((r) => r.json())
      .then((d: PriceResponse) => setData(d))
      .catch(() => setData({ available: false, reason: 'api_error' }))
      .finally(() => setLoading(false));
  }, [state]);

  useEffect(() => { load(commodity); }, [commodity, load]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) setCommodity(query.trim());
  };

  const TrendIcon = data?.trend === 'up' ? TrendingUp : data?.trend === 'down' ? TrendingDown : Minus;
  const trendColor = data?.trend === 'up' ? 'text-emerald-600' : data?.trend === 'down' ? 'text-red-600' : 'text-gray-400';

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <IndianRupee className="w-4 h-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">{t('Market Prices', 'बाज़ार भाव', 'சந்தை விலை')}</h3>
        {data?.date && <span className="ml-auto text-xs text-gray-400">{data.date}</span>}
      </div>

      <div className="p-4">
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Crop name (English)', 'फसल का नाम (अंग्रेज़ी)', 'பயிர் பெயர் (ஆங்கிலம்)')}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none"
          />
          <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700">
            <Search className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_PICKS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setQuery(c); setCommodity(c); }}
              className={`rounded-full px-2.5 py-0.5 text-xs ${commodity.toLowerCase() === c.toLowerCase() ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-sm">{t('Loading prices…', 'भाव लोड हो रहे हैं…', 'விலை ஏற்றப்படுகிறது…')}</span>
            </div>
          ) : data?.available ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-gray-500">{data.commodity} · {t('avg modal', 'औसत भाव', 'சராசரி விலை')}</p>
                  <p className="text-2xl font-bold text-gray-800">₹{data.avgModal?.toLocaleString('en-IN')}<span className="text-sm font-normal text-gray-500">/{t('quintal', 'क्विंटल', 'குவிண்டால்')}</span></p>
                </div>
                {data.trend && (
                  <span className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
                    <TrendIcon className="h-4 w-4" />
                    {data.trend === 'up' ? t('Rising', 'बढ़ रहा', 'உயர்வு') : data.trend === 'down' ? t('Falling', 'गिर रहा', 'வீழ்ச்சி') : t('Steady', 'स्थिर', 'நிலையானது')}
                  </span>
                )}
              </div>

              <div className="mt-3 divide-y divide-gray-50">
                {data.markets?.map((m) => (
                  <div key={`${m.market}-${m.variety}`} className="flex items-center justify-between py-1.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-700">{m.market}</p>
                      <p className="truncate text-xs text-gray-400">{m.district}{m.variety ? ` · ${m.variety}` : ''}</p>
                    </div>
                    <p className="shrink-0 font-semibold text-gray-800">₹{m.modal.toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-4 text-center text-sm text-gray-400">
              {data?.reason === 'no_data'
                ? t(`No recent prices for "${commodity}". Try another crop name in English.`, `"${commodity}" के हाल के भाव नहीं मिले। अंग्रेज़ी में दूसरा नाम आज़माएं।`, `"${commodity}" சமீபத்திய விலை இல்லை. ஆங்கிலத்தில் வேறு பெயரை முயற்சிக்கவும்.`)
                : t('Prices unavailable right now.', 'भाव अभी उपलब्ध नहीं।', 'விலை இப்போது கிடைக்கவில்லை.')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
