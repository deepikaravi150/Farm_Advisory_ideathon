'use client';
import { Leaf, Droplets, Clock, CalendarRange, Thermometer, Sprout, FlaskConical, Lightbulb, IndianRupee } from 'lucide-react';
import type { CropInfo, WaterLevel } from '@/lib/crop-info';

type Locale = 'en' | 'hi' | 'ta';

interface Props {
  cropName: string;
  info: CropInfo | null;
  // Plan-derived values shown when no reference data exists for the crop.
  fallback: { startDate?: string; harvestDate?: string; sellWindow?: string; budget?: number; stages?: number };
  locale: Locale;
}

const WATER_BARS: Record<WaterLevel, number> = { low: 1, medium: 2, high: 3 };

export default function CropDetailsSection({ cropName, info, fallback, locale }: Props) {
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);

  const header = (
    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
      <Leaf className="h-3.5 w-3.5" /> {t('Crop details', 'फसल की जानकारी', 'பயிர் விவரம்')}
    </p>
  );

  if (!info) {
    // Unknown crop — show what we can derive from the plan itself.
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {header}
        <h3 className="mt-1 text-lg font-bold text-gray-900">{cropName}</h3>
        <p className="mt-1 text-sm text-gray-500">
          {t('Detailed growing data is not available for this crop. Plan summary:', 'इस फसल का विस्तृत डेटा उपलब्ध नहीं। योजना सारांश:', 'இந்த பயிருக்கு விரிவான தரவு இல்லை. திட்ட சுருக்கம்:')}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          {fallback.harvestDate && <Metric icon={<CalendarRange className="h-4 w-4 text-emerald-600" />} label={t('Harvest', 'कटाई', 'அறுவடை')} value={fallback.harvestDate} />}
          {fallback.sellWindow && <Metric icon={<Clock className="h-4 w-4 text-amber-600" />} label={t('Sell window', 'बिक्री अवधि', 'விற்பனை காலம்')} value={fallback.sellWindow} />}
          {typeof fallback.budget === 'number' && <Metric icon={<IndianRupee className="h-4 w-4 text-earth-600" />} label={t('Budget', 'बजट', 'பட்ஜெட்')} value={`₹${fallback.budget.toLocaleString('en-IN')}`} />}
          {typeof fallback.stages === 'number' && <Metric icon={<Sprout className="h-4 w-4 text-brand-600" />} label={t('Stages', 'चरण', 'கட்டங்கள்')} value={String(fallback.stages)} />}
        </div>
      </div>
    );
  }

  const bars = WATER_BARS[info.waterLevel];
  const waterLabel = info.waterLevel === 'low' ? t('Low', 'कम', 'குறைவு') : info.waterLevel === 'medium' ? t('Medium', 'मध्यम', 'நடுத்தரம்') : t('High', 'अधिक', 'அதிகம்');
  const seasonWord = t('season', 'मौसम', 'பருவம்');
  const daysWord = t('days', 'दिन', 'நாட்கள்');

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        {header}
        <span className="text-xs text-gray-400">{cropName}</span>
      </div>

      {/* Water requirement — highlighted, since it's the farmer's first question. */}
      <div className="mt-3 rounded-xl bg-sky-50 p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-800">
            <Droplets className="h-4 w-4" /> {t('Water need', 'पानी की जरूरत', 'நீர் தேவை')}
          </p>
          <div className="flex items-center gap-1">
            {[1, 2, 3].map((i) => (
              <span key={i} className={`h-4 w-2 rounded-full ${i <= bars ? 'bg-sky-500' : 'bg-sky-200'}`} />
            ))}
            <span className="ml-1 text-xs font-medium text-sky-700">{waterLabel}</span>
          </div>
        </div>
        <p className="mt-1 text-sm text-sky-900">{info.waterMm} mm / {seasonWord}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <Metric icon={<Clock className="h-4 w-4 text-violet-600" />} label={t('Duration', 'अवधि', 'கால அளவு')} value={`${info.durationDays} ${daysWord}`} />
        <Metric icon={<Thermometer className="h-4 w-4 text-orange-500" />} label={t('Temperature', 'तापमान', 'வெப்பநிலை')} value={`${info.tempRange}°C`} />
        <Metric icon={<CalendarRange className="h-4 w-4 text-emerald-600" />} label={t('Season', 'मौसम', 'பருவம்')} value={info.season[locale]} />
        <Metric icon={<FlaskConical className="h-4 w-4 text-amber-600" />} label={t('Ideal pH', 'उपयुक्त pH', 'ஏற்ற pH')} value={`${info.idealPh[0]} – ${info.idealPh[1]}`} />
        <div className="col-span-2">
          <Metric icon={<Sprout className="h-4 w-4 text-brand-600" />} label={t('Best soil', 'अच्छी मिट्टी', 'ஏற்ற மண்')} value={info.soil[locale]} />
        </div>
      </div>

      <div className="mt-3 flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p>{info.tip[locale]}</p>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="flex items-center gap-1.5 text-xs text-gray-500">{icon}{label}</p>
      <p className="mt-1 font-semibold text-gray-800">{value}</p>
    </div>
  );
}
