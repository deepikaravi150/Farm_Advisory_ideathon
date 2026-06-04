'use client';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useLocale } from 'next-intl';
import { Stethoscope, Camera, Loader2, AlertCircle, ShieldCheck, RotateCcw } from 'lucide-react';

interface Diagnosis {
  isPlant: boolean;
  cropName?: string | null;
  healthy?: boolean;
  diagnosis?: string | null;
  severity?: 'low' | 'medium' | 'high' | null;
  confidence?: 'low' | 'medium' | 'high' | null;
  symptoms?: string[] | null;
  cause?: string | null;
  treatment?: string[] | null;
  prevention?: string[] | null;
  plainSummary?: string | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

export default function CropDoctorWidget() {
  const locale = useLocale();
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('locale', locale);
      const res = await fetch('/api/crop-doctor/diagnose', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('Diagnosis failed.', 'जांच विफल।', 'பரிசோதனை தோல்வி.'));
        return;
      }
      setResult(data.diagnosis as Diagnosis);
    } catch {
      setError(t('Network error. Please try again.', 'नेटवर्क त्रुटि। पुनः प्रयास करें।', 'பிணைய பிழை. மீண்டும் முயற்சிக்கவும்.'));
    } finally {
      setLoading(false);
    }
  }, [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const sev = result?.severity ?? undefined;

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100 flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <Stethoscope className="w-4 h-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">{t('Crop Doctor', 'फसल डॉक्टर', 'பயிர் மருத்துவர்')}</h3>
        {result && (
          <button
            type="button"
            onClick={() => { setResult(null); setError(''); }}
            className="ml-auto flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
          >
            <RotateCcw className="h-3 w-3" /> {t('Check another', 'दूसरा जांचें', 'மற்றொன்று')}
          </button>
        )}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-6 text-brand-600">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm font-medium">{t('Examining the photo…', 'फोटो की जांच हो रही है…', 'புகைப்படத்தை பரிசோதிக்கிறது…')}</p>
          </div>
        ) : result ? (
          <DiagnosisResult result={result} sev={sev} t={t} />
        ) : (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'}`}
          >
            <input {...getInputProps()} />
            <Camera className="mx-auto h-9 w-9 text-gray-400" />
            <p className="mt-2 text-sm font-medium text-gray-700">
              {t('Sick plant? Snap a photo', 'पौधा बीमार है? फोटो लें', 'பயிர் நோயா? புகைப்படம் எடுக்கவும்')}
            </p>
            <p className="text-xs text-gray-500">
              {t('AI finds the pest or disease and tells you the cure', 'एआई कीट/रोग पहचानकर इलाज बताता है', 'AI பூச்சி/நோயை கண்டறிந்து தீர்வு சொல்லும்')}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-3 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosisResult({
  result,
  sev,
  t,
}: {
  result: Diagnosis;
  sev?: string;
  t: (en: string, hi: string, ta: string) => string;
}) {
  if (result.isPlant === false) {
    return (
      <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{result.plainSummary || t('This does not look like a plant. Please photograph the affected crop closely.', 'यह पौधा नहीं लगता। कृपया प्रभावित फसल की नज़दीकी फोटो लें।', 'இது பயிராக தெரியவில்லை. பாதிக்கப்பட்ட பயிரை அருகில் படம் எடுக்கவும்.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-800">{result.diagnosis || t('Diagnosis', 'निदान', 'நோயறிதல்')}</p>
          {result.cropName && <p className="text-xs text-gray-500">{result.cropName}</p>}
        </div>
        {sev && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[sev] ?? 'bg-gray-100 text-gray-600'}`}>
            {t('Severity', 'गंभीरता', 'தீவிரம்')}: {sev}
          </span>
        )}
      </div>

      {result.plainSummary && <p className="text-sm text-gray-700">{result.plainSummary}</p>}

      {Array.isArray(result.treatment) && result.treatment.length > 0 && (
        <div className="rounded-xl bg-brand-50 p-3">
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('Treatment', 'इलाज', 'சிகிச்சை')}
          </p>
          <ul className="space-y-1 text-sm text-gray-700">
            {result.treatment.map((step) => (
              <li key={step} className="flex gap-2"><span className="text-brand-600">•</span><span>{step}</span></li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(result.prevention) && result.prevention.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Prevention', 'रोकथाम', 'தடுப்பு')}</p>
          <ul className="space-y-1 text-sm text-gray-600">
            {result.prevention.map((step) => (
              <li key={step} className="flex gap-2"><span className="text-gray-400">•</span><span>{step}</span></li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        {t('AI guidance — confirm dosage with your local agri shop.', 'एआई सलाह — मात्रा स्थानीय कृषि दुकान से पुष्टि करें।', 'AI ஆலோசனை — அளவை உள்ளூர் வேளாண் கடையில் உறுதி செய்யவும்.')}
      </p>
    </div>
  );
}
