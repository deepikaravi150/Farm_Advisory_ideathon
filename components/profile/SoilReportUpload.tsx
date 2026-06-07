'use client';
import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useLocale } from 'next-intl';
import { useTranslations } from 'next-intl';
import { Upload, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface SoilData {
  ph: number;
  nitrogen: string;
  phosphorus: string;
  potassium: string;
  organicCarbon: string;
  electricalConductivity?: number | null;
  micronutrients?: Record<string, string | null>;
  plainLanguageSummary?: string | null;
  keyFindings?: string[] | null;
  recommendations: string;
  labName: string;
  reportDate: string;
  locale?: string | null;
}

interface Props {
  initialSoil?: SoilData | null;
  onUploadSuccess: (data: SoilData) => void;
}

export default function SoilReportUpload({ initialSoil, onUploadSuccess }: Props) {
  const t = useTranslations('soil');
  const locale = useLocale();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<SoilData | null>(null);
  const [displayResult, setDisplayResult] = useState<SoilData | null>(null);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [notice, setNotice] = useState('');
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    setResult(initialSoil ?? null);
    setDisplayResult(initialSoil ?? null);
  }, [initialSoil]);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    setErrorDetail('');
    setNotice('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('locale', locale);
      const res = await fetch('/api/soil/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('uploadFailed'));
        setErrorDetail(typeof data.detail === 'string' ? data.detail : '');
        return;
      }
      setResult(data.soilData);
      setDisplayResult(data.soilData);
      if (data.duplicate) {
        setNotice(locale === 'ta'
          ? 'இந்த மண் அறிக்கை விவரங்கள் ஏற்கனவே உள்ளன. கீழே உள்ள தற்போதைய விவரங்கள் பயன்படுத்தப்படுகின்றன.'
          : locale === 'hi'
            ? 'इस मिट्टी रिपोर्ट का विवरण पहले से मौजूद है। नीचे मौजूदा विवरण दिखाया गया है।'
            : 'These soil report details are already present. The current details are shown below.');
      }
      onUploadSuccess(data.soilData);
    } catch (err) {
      setError(t('uploadFailed'));
      setErrorDetail(err instanceof Error ? err.message : '');
    }
    finally { setUploading(false); }
  }, [locale, onUploadSuccess, t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [], 'application/pdf': ['.pdf'] }, maxFiles: 1, maxSize: 10 * 1024 * 1024,
  });

  useEffect(() => {
    let cancelled = false;
    if (!result) {
      setDisplayResult(null);
      return;
    }

    const textPayload = {
      plainLanguageSummary: result.plainLanguageSummary,
      keyFindings: result.keyFindings,
      recommendations: result.recommendations,
      labName: result.labName,
    };

    setTranslating(true);
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale, kind: 'soil_report', payload: textPayload }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('translation failed')))
      .then((data) => {
        if (cancelled) return;
        const translated = data.payload ?? {};
        setDisplayResult({
          ...result,
          plainLanguageSummary: typeof translated.plainLanguageSummary === 'string' ? translated.plainLanguageSummary : result.plainLanguageSummary,
          keyFindings: Array.isArray(translated.keyFindings) ? translated.keyFindings : result.keyFindings,
          recommendations: typeof translated.recommendations === 'string' ? translated.recommendations : result.recommendations,
          labName: typeof translated.labName === 'string' ? translated.labName : result.labName,
        });
      })
      .catch(() => {
        if (!cancelled) setDisplayResult(result);
      })
      .finally(() => {
        if (!cancelled) setTranslating(false);
      });

    return () => { cancelled = true; };
  }, [locale, result]);

  const labels = {
    extracted: locale === 'ta' ? 'மண் அறிக்கை பிரித்தெடுக்கப்பட்டது' : locale === 'hi' ? 'मिट्टी रिपोर्ट निकाली गई' : 'Soil Report Extracted',
    whatThisMeans: locale === 'ta' ? 'இதன் பொருள்' : locale === 'hi' ? 'इसका मतलब' : 'What this means',
    keyFindings: locale === 'ta' ? 'முக்கிய கண்டுபிடிப்புகள்' : locale === 'hi' ? 'मुख्य बातें' : 'Key findings',
    nitrogen: locale === 'ta' ? 'நைட்ரஜன்' : locale === 'hi' ? 'नाइट्रोजन' : 'Nitrogen',
    phosphorus: locale === 'ta' ? 'பாஸ்பரஸ்' : locale === 'hi' ? 'फॉस्फोरस' : 'Phosphorus',
    potassium: locale === 'ta' ? 'பொட்டாசியம்' : locale === 'hi' ? 'पोटैशियम' : 'Potassium',
    low: locale === 'ta' ? 'குறைவு' : locale === 'hi' ? 'कम' : 'low',
    medium: locale === 'ta' ? 'மிதமானது' : locale === 'hi' ? 'मध्यम' : 'medium',
    high: locale === 'ta' ? 'அதிகம்' : locale === 'hi' ? 'अधिक' : 'high',
    recommendations: locale === 'ta' ? 'AI பரிந்துரைகள்' : locale === 'hi' ? 'एआई सिफ़ारिशें' : 'AI Recommendations',
  };

  function displayValue(value: unknown): string | number {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return String(value);
    if (value === 'low') return labels.low;
    if (value === 'medium') return labels.medium;
    if (value === 'high') return labels.high;
    return value;
  }

  return (
    <div className="space-y-4">
      {displayResult && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-800">{labels.extracted}</p>
              <p className="text-xs text-green-700">
                {locale === 'ta'
                  ? 'இந்த மண் அறிக்கை விவரங்கள் உங்கள் சுயவிவரத்தில் ஏற்கனவே சேமிக்கப்பட்டுள்ளன.'
                  : locale === 'hi'
                    ? 'यह मिट्टी रिपोर्ट विवरण आपकी प्रोफाइल में पहले से सेव है।'
                    : 'These soil report details are already saved in your profile.'}
              </p>
            </div>
            {translating && <Loader2 className="ml-auto h-4 w-4 animate-spin text-green-600" />}
          </div>
        </div>
      )}

      <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'}`}>
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
            <p className="text-brand-600 font-medium">{t('analyzing')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Upload className="w-10 h-10 text-gray-400" />
            <p className="font-medium text-gray-700">{t('dropHere')}</p>
            <p className="text-sm">{t('browseHint')}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex gap-2 text-red-600 bg-red-50 rounded-xl p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{error}</p>
            {errorDetail && <p className="mt-1 text-xs text-red-500">{errorDetail}</p>}
          </div>
        </div>
      )}

      {notice && (
        <div className="flex gap-2 text-amber-700 bg-amber-50 rounded-xl p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{notice}</p>
        </div>
      )}

      {displayResult && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold text-green-800">{labels.extracted}</h4>
            {translating && <Loader2 className="h-4 w-4 animate-spin text-green-600" />}
            {displayResult.labName && <span className="text-sm text-green-600 ml-auto">{displayResult.labName}</span>}
          </div>
          {displayResult.plainLanguageSummary && (
            <div className="mb-4 rounded-xl border border-green-100 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-green-700 mb-1">
                {labels.whatThisMeans}
              </p>
              <p className="text-sm leading-relaxed text-gray-700">{displayResult.plainLanguageSummary}</p>
            </div>
          )}

          {Array.isArray(displayResult.keyFindings) && displayResult.keyFindings.length > 0 && (
            <div className="mb-4 rounded-xl border border-green-100 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-green-700 mb-2">
                {labels.keyFindings}
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                {displayResult.keyFindings.map(finding => (
                  <li key={finding} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'pH', value: displayResult.ph },
              { label: labels.nitrogen, value: displayValue(displayResult.nitrogen) },
              { label: labels.phosphorus, value: displayValue(displayResult.phosphorus) },
              { label: labels.potassium, value: displayValue(displayResult.potassium) },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="font-bold text-gray-800 mt-1">{item.value ?? '—'}</p>
              </div>
            ))}
          </div>
          {displayResult.recommendations && (
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">{labels.recommendations}</p>
              <p className="text-sm text-gray-700">{displayResult.recommendations}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
