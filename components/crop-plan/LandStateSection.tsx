'use client';

import { useEffect, useMemo, useState } from 'react';
import { Mountain, FileText, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { CropInfo } from '@/lib/crop-info';

type Locale = 'en' | 'hi' | 'ta';

export interface SoilData {
  ph?: number | string | null;
  electricalConductivity?: number | string | null;
  organicCarbon?: string | null;
  nitrogen?: string | null;
  phosphorus?: string | null;
  potassium?: string | null;
  plainLanguageSummary?: string | null;
  keyFindings?: string[] | null;
  recommendations?: string[] | string | null;
  labName?: string | null;
  locale?: string | null;
}

interface Props {
  soil: SoilData | null;
  info: CropInfo | null;
  cropName: string;
  locale: Locale;
}

const LEVEL_STYLES: Record<string, string> = {
  low: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-emerald-100 text-emerald-700',
};

function normalizeLevel(value?: string | null) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function reportText(soil: SoilData) {
  return [soil.plainLanguageSummary, ...(soil.keyFindings ?? []), soil.recommendations].filter(Boolean).join(' ');
}

function hasTamilOrHindiScript(value: string) {
  return /[\u0900-\u097F\u0B80-\u0BFF]/.test(value);
}

function hasTamilScript(value: string) {
  return /[\u0B80-\u0BFF]/.test(value);
}

function hasHindiScript(value: string) {
  return /[\u0900-\u097F]/.test(value);
}

function shouldTranslateSoil(soil: SoilData, locale: string) {
  const text = reportText(soil);
  if (!text) return false;
  if (locale === 'en') return hasTamilOrHindiScript(text);
  if (locale === 'ta') return !hasTamilScript(text);
  if (locale === 'hi') return !hasHindiScript(text);
  return soil.locale !== locale;
}

export default function LandStateSection({ soil, info, cropName, locale }: Props) {
  const [translatedSoil, setTranslatedSoil] = useState<SoilData | null>(null);
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);

  const translationKey = useMemo(() => {
    if (!soil) return '';
    return JSON.stringify({
      locale,
      sourceLocale: soil.locale,
      summary: soil.plainLanguageSummary,
      findings: soil.keyFindings,
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
              plainLanguageSummary: soil.plainLanguageSummary,
              keyFindings: soil.keyFindings,
              recommendations: soil.recommendations,
            },
          }),
        });

        if (!res.ok) return;
        const data = await res.json();
        const translated = data.payload ?? data.translated;
        if (cancelled || !translated) return;

        setTranslatedSoil({
          ...soil,
          plainLanguageSummary: translated.plainLanguageSummary ?? soil.plainLanguageSummary,
          keyFindings: translated.keyFindings ?? soil.keyFindings,
          recommendations: translated.recommendations ?? soil.recommendations,
          locale,
        });
      } catch (error) {
        console.error('Crop plan soil translation failed:', error);
      }
    };

    translateSoil();

    return () => {
      cancelled = true;
    };
  }, [locale, soil, translationKey]);

  const displaySoil = translatedSoil ?? soil;
  const header = (
    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700">
      <Mountain className="h-3.5 w-3.5" /> {t('Current state of your land', 'आपकी जमीन की स्थिति', 'உங்கள் நிலத்தின் தற்போதைய நிலை')}
    </p>
  );

  if (!displaySoil) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {header}
        <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-xl bg-gray-50 p-6 text-center">
          <FileText className="h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">{t('No soil report details yet', 'अभी मिट्टी रिपोर्ट विवरण नहीं है', 'இன்னும் மண் அறிக்கை விவரங்கள் இல்லை')}</p>
          <p className="text-xs text-gray-500">{t('After a report is added in Profile, its values will guide this crop plan.', 'प्रोफाइल में रिपोर्ट जुड़ने के बाद उसके मान इस फसल योजना को मार्गदर्शित करेंगे।', 'சுயவிவரத்தில் அறிக்கை சேர்க்கப்பட்ட பின், அதன் மதிப்புகள் இந்த பயிர் திட்டத்தை வழிநடத்தும்.')}</p>
        </div>
      </div>
    );
  }

  const levelLabel = (value?: string | null) => {
    const normalized = normalizeLevel(value);
    if (!normalized) return '-';
    if (normalized === 'low') return t('Low', 'कम', 'குறைவு');
    if (normalized === 'medium') return t('Medium', 'मध्यम', 'நடுத்தரம்');
    if (normalized === 'high') return t('High', 'अधिक', 'அதிகம்');
    return value ?? '-';
  };

  const ph = displaySoil.ph != null && displaySoil.ph !== '' ? Number(displaySoil.ph) : null;
  let phStatus: 'ok' | 'acidic' | 'alkaline' | 'unknown' = 'unknown';
  if (ph != null && !Number.isNaN(ph) && info) {
    const [lo, hi] = info.idealPh;
    phStatus = ph < lo - 0.3 ? 'acidic' : ph > hi + 0.3 ? 'alkaline' : 'ok';
  }

  const lowNutrients = [
    normalizeLevel(displaySoil.nitrogen) === 'low' ? t('nitrogen', 'नाइट्रोजन', 'நைட்ரஜன்') : '',
    normalizeLevel(displaySoil.phosphorus) === 'low' ? t('phosphorus', 'फॉस्फोरस', 'பாஸ்பரஸ்') : '',
    normalizeLevel(displaySoil.potassium) === 'low' ? t('potassium', 'पोटैशियम', 'பொட்டாசியம்') : '',
  ].filter(Boolean);

  const suitable = info && phStatus === 'ok' && lowNutrients.length === 0;
  let verdict: { tone: 'good' | 'warn' | 'info'; text: string };
  if (!info) {
    verdict = { tone: 'info', text: t('Soil metrics below. Crop-fit check needs a known crop.', 'मिट्टी मेट्रिक्स नीचे हैं। फसल उपयुक्तता हेतु ज्ञात फसल चाहिए।', 'மண் அளவீடுகள் கீழே. பயிர் பொருத்தத்திற்கு அறியப்பட்ட பயிர் தேவை.') };
  } else if (suitable) {
    verdict = { tone: 'good', text: t(`Your soil looks well suited for ${cropName}.`, `आपकी मिट्टी ${cropName} के लिए उपयुक्त लगती है।`, `உங்கள் மண் ${cropName} பயிருக்கு ஏற்றதாக உள்ளது.`) };
  } else {
    const issues: string[] = [];
    if (phStatus === 'acidic') issues.push(t(`pH ${ph} is below the ideal ${info.idealPh[0]}-${info.idealPh[1]} - add lime`, `pH ${ph} आदर्श ${info.idealPh[0]}-${info.idealPh[1]} से कम है - चूना डालें`, `pH ${ph} ஏற்ற ${info.idealPh[0]}-${info.idealPh[1]} விட குறைவு - சுண்ணாம்பு சேர்க்கவும்`));
    if (phStatus === 'alkaline') issues.push(t(`pH ${ph} is above the ideal ${info.idealPh[0]}-${info.idealPh[1]} - add gypsum/organic matter`, `pH ${ph} आदर्श ${info.idealPh[0]}-${info.idealPh[1]} से अधिक है - जिप्सम/जैविक खाद डालें`, `pH ${ph} ஏற்ற ${info.idealPh[0]}-${info.idealPh[1]} விட அதிகம் - ஜிப்சம்/இயற்கை உரம் சேர்க்கவும்`));
    if (lowNutrients.length) issues.push(t(`Low ${lowNutrients.join(', ')} - apply suitable fertilizer`, `कम ${lowNutrients.join(', ')} - उपयुक्त खाद डालें`, `குறைந்த ${lowNutrients.join(', ')} - ஏற்ற உரம் இடவும்`));
    verdict = { tone: 'warn', text: issues.join('. ') };
  }

  const verdictStyle = verdict.tone === 'good' ? 'bg-emerald-50 text-emerald-800' : verdict.tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800';
  const VerdictIcon = verdict.tone === 'good' ? CheckCircle2 : verdict.tone === 'warn' ? AlertTriangle : Info;

  return (
    <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        {header}
        {displaySoil.labName && <span className="text-xs text-gray-400">{displaySoil.labName}</span>}
      </div>

      <div className={`mt-3 flex gap-2 rounded-xl p-3 text-sm font-medium ${verdictStyle}`}>
        <VerdictIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{verdict.text}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <SoilMetric label="pH" value={displaySoil.ph != null ? String(displaySoil.ph) : '-'} />
        <SoilMetric label={t('EC (salinity)', 'EC (लवणता)', 'EC (உப்புத்தன்மை)')} value={displaySoil.electricalConductivity != null ? String(displaySoil.electricalConductivity) : '-'} />
        <SoilMetric label={t('Org. carbon', 'जैविक कार्बन', 'கரிமக் கார்பன்')} value={levelLabel(displaySoil.organicCarbon)} levelKey={displaySoil.organicCarbon} />
        <SoilMetric label={t('Nitrogen (N)', 'नाइट्रोजन (N)', 'நைட்ரஜன் (N)')} value={levelLabel(displaySoil.nitrogen)} levelKey={displaySoil.nitrogen} />
        <SoilMetric label={t('Phosphorus (P)', 'फॉस्फोरस (P)', 'பாஸ்பரஸ் (P)')} value={levelLabel(displaySoil.phosphorus)} levelKey={displaySoil.phosphorus} />
        <SoilMetric label={t('Potassium (K)', 'पोटैशियम (K)', 'பொட்டாசியம் (K)')} value={levelLabel(displaySoil.potassium)} levelKey={displaySoil.potassium} />
      </div>

      {displaySoil.plainLanguageSummary && (
        <p className="mt-3 text-sm leading-6 text-gray-700">{displaySoil.plainLanguageSummary}</p>
      )}
    </div>
  );
}

function SoilMetric({ label, value, levelKey }: { label: string; value: string; levelKey?: string | null }) {
  const badge = levelKey && LEVEL_STYLES[normalizeLevel(levelKey)] ? LEVEL_STYLES[normalizeLevel(levelKey)] : 'bg-gray-100 text-gray-700';
  return (
    <div className="rounded-lg bg-gray-50 p-2.5 text-center">
      <p className="text-[11px] text-gray-500">{label}</p>
      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>{value}</span>
    </div>
  );
}
