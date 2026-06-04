'use client';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { FlaskConical, ArrowRight, Upload } from 'lucide-react';

export interface SoilSummary {
  ph?: number | null;
  nitrogen?: string | null;
  phosphorus?: string | null;
  potassium?: string | null;
  plain_language_summary?: string | null;
  key_findings?: string[] | null;
}

interface Props {
  soil: SoilSummary | null;
}

const LEVEL_STYLES: Record<string, string> = {
  low: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-emerald-100 text-emerald-700',
};

export default function SoilHealthWidget({ soil }: Props) {
  const locale = useLocale();
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);

  const levelLabel = (v?: string | null) => {
    if (!v) return '—';
    if (v === 'low') return t('Low', 'कम', 'குறைவு');
    if (v === 'medium') return t('Medium', 'मध्यम', 'நடுத்தரம்');
    if (v === 'high') return t('High', 'अधिक', 'அதிகம்');
    return v;
  };

  if (!soil) {
    return (
      <div className="bg-white rounded-2xl shadow border border-gray-100 flex flex-col">
        <div className="flex items-center gap-2 p-4 border-b border-gray-100">
          <FlaskConical className="w-4 h-4 text-brand-600" />
          <h3 className="font-semibold text-gray-700">{t('Soil Health', 'मिट्टी की सेहत', 'மண் ஆரோக்கியம்')}</h3>
        </div>
        <Link href="/profile" className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-gray-500 hover:bg-gray-50">
          <Upload className="h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">{t('Upload your soil report', 'अपनी मिट्टी रिपोर्ट अपलोड करें', 'உங்கள் மண் அறிக்கையை பதிவேற்றவும்')}</p>
          <p className="text-xs">{t('Get fertilizer advice made for your land', 'अपनी ज़मीन के लिए खाद सलाह पाएं', 'உங்கள் நிலத்திற்கான உர ஆலோசனை பெறுங்கள்')}</p>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <FlaskConical className="w-4 h-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">{t('Soil Health', 'मिट्टी की सेहत', 'மண் ஆரோக்கியம்')}</h3>
        <Link href="/profile" className="ml-auto flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
          {t('Details', 'विवरण', 'விவரம்')} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: 'pH', value: soil.ph ?? '—', style: 'bg-gray-100 text-gray-700' },
            { label: 'N', value: levelLabel(soil.nitrogen), style: LEVEL_STYLES[soil.nitrogen ?? ''] ?? 'bg-gray-100 text-gray-600' },
            { label: 'P', value: levelLabel(soil.phosphorus), style: LEVEL_STYLES[soil.phosphorus ?? ''] ?? 'bg-gray-100 text-gray-600' },
            { label: 'K', value: levelLabel(soil.potassium), style: LEVEL_STYLES[soil.potassium ?? ''] ?? 'bg-gray-100 text-gray-600' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg p-2 text-center bg-gray-50">
              <p className="text-[11px] text-gray-500">{item.label}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${item.style}`}>{item.value}</span>
            </div>
          ))}
        </div>
        {soil.plain_language_summary && (
          <p className="text-sm text-gray-700 line-clamp-3">{soil.plain_language_summary}</p>
        )}
        {!soil.plain_language_summary && Array.isArray(soil.key_findings) && soil.key_findings[0] && (
          <p className="text-sm text-gray-700 line-clamp-3">{soil.key_findings[0]}</p>
        )}
      </div>
    </div>
  );
}
