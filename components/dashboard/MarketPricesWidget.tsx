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

const CROP_LABELS: Record<string, { hi: string; ta: string }> = {
  Tomato: { hi: 'टमाटर', ta: 'தக்காளி' },
  Onion: { hi: 'प्याज', ta: 'வெங்காயம்' },
  Rice: { hi: 'चावल', ta: 'அரிசி' },
  'Paddy(Dhan)': { hi: 'धान', ta: 'நெல்' },
  Paddy: { hi: 'धान', ta: 'நெல்' },
  Brinjal: { hi: 'बैंगन', ta: 'கத்தரிக்காய்' },
  Banana: { hi: 'केला', ta: 'வாழை' },
  Chilli: { hi: 'मिर्च', ta: 'மிளகாய்' },
  'Green Chilli': { hi: 'हरी मिर्च', ta: 'பச்சை மிளகாய்' },
};

const MARKET_WORDS: Array<[RegExp, { hi: string; ta: string }]> = [
  [/Uzhavar Sandhai/gi, { hi: 'किसान बाजार', ta: 'உழவர் சந்தை' }],
  [/APMC/gi, { hi: 'एपीएमसी', ta: 'ஏபிஎம்சி' }],
  [/Green Chilli/gi, { hi: 'हरी मिर्च', ta: 'பச்சை மிளகாய்' }],
  [/Other/gi, { hi: 'अन्य', ta: 'மற்றவை' }],
  [/Round/gi, { hi: 'गोल', ta: 'வட்டம்' }],
];

const DISTRICT_LABELS: Record<string, { hi: string; ta: string }> = {
  Namakkal: { hi: 'नामक्कल', ta: 'நாமக்கல்' },
  Dharmapuri: { hi: 'धर्मपुरी', ta: 'தர்மபுரி' },
  Tenkasi: { hi: 'तेनकासी', ta: 'தென்காசி' },
  Cuddalore: { hi: 'कडलूर', ta: 'கடலூர்' },
  Perambalur: { hi: 'पेरम्बलूर', ta: 'பெரம்பலூர்' },
  Salem: { hi: 'सेलम', ta: 'சேலம்' },
  Ranipet: { hi: 'रानीपेट', ta: 'ராணிப்பேட்டை' },
  Tiruvannamalai: { hi: 'तिरुवन्नामलाई', ta: 'திருவண்ணாமலை' },
  Madurai: { hi: 'मदुरै', ta: 'மதுரை' },
  Karur: { hi: 'करूर', ta: 'கரூர்' },
  Theni: { hi: 'थेनी', ta: 'தேனி' },
};

const EXTRA_MARKET_WORDS: Array<[RegExp, { hi: string; ta: string }]> = [
  [/Green Chilly/gi, { hi: 'हरी मिर्च', ta: 'பச்சை மிளகாய்' }],
];

const EXTRA_PLACE_LABELS: Record<string, { hi: string; ta: string }> = {
  Paramathivelur: { hi: 'परमाथिवेलूर', ta: 'பரமத்திவேலூர்' },
  Pudukottai: { hi: 'पुदुक्कोट्टई', ta: 'புதுக்கோட்டை' },
  Ammapet: { hi: 'अम्मापेट', ta: 'அம்மாபேட்டை' },
  Hosur: { hi: 'होसूर', ta: 'ஓசூர்' },
  Aranthangi: { hi: 'अरंथांगी', ta: 'அறந்தாங்கி' },
  Krishnagiri: { hi: 'कृष्णगिरि', ta: 'கிருஷ்ணகிரி' },
};

const ADDITIONAL_PLACE_LABELS: Record<string, { hi: string; ta: string }> = {
  Mohanur: { hi: 'मोहनूर', ta: 'மோகனூர்' },
  Sirkali: { hi: 'सीरकाज़ी', ta: 'சீர்காழி' },
  Kumarapalayam: { hi: 'कुमारपालयम', ta: 'குமாரபாளையம்' },
  Devakottai: { hi: 'देवकोट्टई', ta: 'தேவகோட்டை' },
  Thanjavur: { hi: 'तंजावुर', ta: 'தஞ்சாவூர்' },
  Manapparai: { hi: 'मनप्पारै', ta: 'மணப்பாறை' },
  Nagapattinam: { hi: 'नागपट्टिनम', ta: 'நாகப்பட்டினம்' },
  Sivaganga: { hi: 'शिवगंगा', ta: 'சிவகங்கை' },
  Tiruchirappalli: { hi: 'तिरुचिरापल्ली', ta: 'திருச்சிராப்பள்ளி' },
};

export default function MarketPricesWidget({ defaultCommodity, state = 'Tamil Nadu' }: Props) {
  const locale = useLocale();
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);
  const localCrop = (name?: string | null) => {
    if (!name) return '';
    const key = CROP_LABELS[name] ? name : Object.keys(CROP_LABELS).find((crop) => crop.toLowerCase() === name.toLowerCase());
    if (!key || locale === 'en') return name;
    return CROP_LABELS[key]?.[locale as 'hi' | 'ta'] ?? name;
  };
  const localMarketText = (value?: string | null) => {
    if (!value || locale === 'en') return value ?? '';
    const placeLabels = { ...DISTRICT_LABELS, ...EXTRA_PLACE_LABELS, ...ADDITIONAL_PLACE_LABELS };
    let text = placeLabels[value]?.[locale as 'hi' | 'ta'] ?? value;
    for (const [place, labels] of Object.entries(placeLabels)) {
      text = text.replace(new RegExp(place, 'gi'), labels[locale as 'hi' | 'ta']);
    }
    for (const [pattern, labels] of [...MARKET_WORDS, ...EXTRA_MARKET_WORDS]) {
      text = text.replace(pattern, labels[locale as 'hi' | 'ta']);
    }
    return text;
  };

  const initial = (defaultCommodity ?? 'Tomato').trim();
  const [commodity, setCommodity] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [inputFocused, setInputFocused] = useState(false);
  const [data, setData] = useState<PriceResponse | null>(null);
  const [translatedMarkets, setTranslatedMarkets] = useState<MarketPrice[] | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    setTranslatedMarkets(null);
    if (locale === 'en' || !data?.markets?.length) return;

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locale,
        kind: 'crop_plan',
        payload: data.markets.map((market) => ({
          ...market,
          market: localMarketText(market.market),
          district: localMarketText(market.district),
          variety: localMarketText(market.variety),
        })),
      }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('translate failed')))
      .then((payload) => {
        if (!cancelled && Array.isArray(payload.payload)) {
          setTranslatedMarkets(payload.payload as MarketPrice[]);
        }
      })
      .catch(() => {
        if (!cancelled) setTranslatedMarkets(null);
      });

    return () => {
      cancelled = true;
    };
  }, [data?.markets, locale]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) setCommodity(query.trim());
  };

  const TrendIcon = data?.trend === 'up' ? TrendingUp : data?.trend === 'down' ? TrendingDown : Minus;
  const trendColor = data?.trend === 'up' ? 'text-emerald-600' : data?.trend === 'down' ? 'text-red-600' : 'text-gray-400';

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <IndianRupee className="w-4 h-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">{t('Market Prices', 'बाज़ार भाव', 'சந்தை விலை')}</h3>
        {data?.date && <span className="ml-auto text-xs text-gray-400">{data.date}</span>}
      </div>

      <div className="p-4">
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={inputFocused || locale === 'en' ? query : localCrop(query)}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
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
              {localCrop(c)}
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
                  <p className="text-xs text-gray-500">{localCrop(data.commodity)} · {t('avg modal', 'औसत भाव', 'சராசரி விலை')}</p>
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
                {(translatedMarkets ?? data.markets)?.map((m) => (
                  <div key={`${m.market}-${m.variety}`} className="flex items-center justify-between py-1.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700">{localMarketText(m.market)}</p>
                      <p className="text-xs text-gray-400">{localMarketText(m.district)}{m.variety ? ` · ${localMarketText(m.variety)}` : ''}</p>
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
