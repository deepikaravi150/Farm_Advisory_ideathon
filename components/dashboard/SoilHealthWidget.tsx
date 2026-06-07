'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { FlaskConical, ArrowRight, FileText } from 'lucide-react';

export interface SoilSummary {
  ph?: number | null;
  nitrogen?: string | null;
  phosphorus?: string | null;
  potassium?: string | null;
  plain_language_summary?: string | null;
  key_findings?: string[] | null;
  recommendations?: string[] | string | null;
  locale?: string | null;
}

interface Props {
  soil: SoilSummary | null;
}

const LEVEL_STYLES: Record<string, string> = {
  low: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-emerald-100 text-emerald-700',
};

function normalizeLevel(value?: string | null) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function hasTamilOrHindiScript(value: unknown): boolean {
  const text = Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : '';
  return /[\u0900-\u097F\u0B80-\u0BFF]/.test(text);
}

function hasTamilScript(value: unknown): boolean {
  const text = Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : '';
  return /[\u0B80-\u0BFF]/.test(text);
}

function hasHindiScript(value: unknown): boolean {
  const text = Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : '';
  return /[\u0900-\u097F]/.test(text);
}

function shouldTranslateSoil(soil: SoilSummary, locale: string): boolean {
  const text = [soil.plain_language_summary, ...(soil.key_findings ?? []), soil.recommendations].filter(Boolean).join(' ');
  if (!text) return false;
  if (locale === 'en') return hasTamilOrHindiScript(text);
  if (locale === 'ta') return !hasTamilScript(text);
  if (locale === 'hi') return !hasHindiScript(text);
  return soil.locale !== locale;
}

export default function SoilHealthWidget({ soil }: Props) {
  const locale = useLocale();
  const [translatedSoil, setTranslatedSoil] = useState<SoilSummary | null>(null);
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);

  const translationKey = useMemo(() => {
    if (!soil) return '';
    return JSON.stringify({
      locale,
      sourceLocale: soil.locale,
      summary: soil.plain_language_summary,
      findings: soil.key_findings,
      recommendations: soil.recommendations,
    });
  }, [locale, soil]);

  useEffect(() => {
    let cancelled = false;
    setTranslatedSoil(null);

    if (!soil || !shouldTranslateSoil(soil, locale)) return;

    const translateSoil = async () => {
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locale,
            kind: 'soil_report',
            payload: {
              plainLanguageSummary: soil.plain_language_summary,
              keyFindings: soil.key_findings,
              recommendations: soil.recommendations,
              targetLanguage: locale,
              instruction: `Translate farmer-facing soil report text into ${locale === 'en' ? 'English' : locale === 'hi' ? 'Hindi' : 'Tamil'}.`,
            },
          }),
        });

        if (!res.ok) return;
        const data = await res.json();
        const translated = data.payload ?? data.translated;
        if (cancelled || !translated) return;

        setTranslatedSoil({
          ...soil,
          plain_language_summary: translated.plainLanguageSummary ?? soil.plain_language_summary,
          key_findings: translated.keyFindings ?? soil.key_findings,
          recommendations: translated.recommendations ?? soil.recommendations,
          locale,
        });
      } catch (error) {
        console.error('Soil report translation failed:', error);
      }
    };

    translateSoil();

    return () => {
      cancelled = true;
    };
  }, [locale, soil, translationKey]);

  const displaySoil = translatedSoil ?? soil;

  const levelLabel = (value?: string | null) => {
    const normalized = normalizeLevel(value);
    if (!normalized) return '-';
    if (normalized === 'low') return t('Low', 'कम', 'குறைவு');
    if (normalized === 'medium') return t('Medium', 'मध्यम', 'நடுத்தரம்');
    if (normalized === 'high') return t('High', 'अधिक', 'அதிகம்');
    return value ?? '-';
  };

  const levelStyle = (value?: string | null) => LEVEL_STYLES[normalizeLevel(value)] ?? 'bg-gray-100 text-gray-600';

  if (!displaySoil) {
    return (
      <div className="flex flex-col rounded-xl border border-gray-100 bg-white shadow">
        <div className="flex items-center gap-2 p-4 border-b border-gray-100">
          <FlaskConical className="w-4 h-4 text-brand-600" />
          <h3 className="font-semibold text-gray-700">{t('Soil Health', 'मिट्टी की सेहत', 'மண் ஆரோக்கியம்')}</h3>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-gray-500">
          <FileText className="h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">{t('No soil report details yet', 'अभी मिट्टी रिपोर्ट विवरण नहीं है', 'இன்னும் மண் அறிக்கை விவரங்கள் இல்லை')}</p>
          <p className="text-xs">{t('Soil values added from Profile will appear here.', 'प्रोफाइल से जोड़े गए मिट्टी मान यहां दिखेंगे।', 'சுயவிவரத்தில் சேர்க்கப்பட்ட மண் மதிப்புகள் இங்கே தோன்றும்.')}</p>
        </div>
      </div>
    );
  }

  const summary = displaySoil.plain_language_summary
    || (Array.isArray(displaySoil.key_findings) ? displaySoil.key_findings[0] : '');

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow">
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
            { label: 'pH', value: displaySoil.ph ?? '-', style: 'bg-gray-100 text-gray-700' },
            { label: 'N', value: levelLabel(displaySoil.nitrogen), style: levelStyle(displaySoil.nitrogen) },
            { label: 'P', value: levelLabel(displaySoil.phosphorus), style: levelStyle(displaySoil.phosphorus) },
            { label: 'K', value: levelLabel(displaySoil.potassium), style: levelStyle(displaySoil.potassium) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg p-2 text-center bg-gray-50">
              <p className="text-[11px] text-gray-500">{item.label}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${item.style}`}>{item.value}</span>
            </div>
          ))}
        </div>
        {summary ? (
          <p className="text-xs text-gray-600">{summary}</p>
        ) : (
          <p className="text-xs text-gray-500">{t('Soil report uploaded. Detailed findings are available in Profile.', 'मिट्टी रिपोर्ट अपलोड हो गई है। पूरा विवरण प्रोफाइल में उपलब्ध है।', 'மண் அறிக்கை பதிவேற்றப்பட்டது. விரிவான விவரங்கள் சுயவிவரத்தில் உள்ளன.')}</p>
        )}
      </div>
    </div>
  );
}
