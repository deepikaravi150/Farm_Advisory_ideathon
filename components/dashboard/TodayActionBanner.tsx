'use client';

import { useLocale } from 'next-intl';
import Link from 'next/link';
import { CloudSun, Sprout, ArrowRight } from 'lucide-react';
import type { CurrentWeather, ForecastDay } from '@/lib/weather';
import { nextStepFromPlan, toAppLocale, weatherVerdict, type WeatherTone } from '@/lib/farm-advice';

interface PlanProp {
  crop_name?: string;
  milestones?: Array<{ label?: string; date?: string; endDate?: string; tasks?: string; alert?: boolean; alertAdvice?: string }>;
}

interface Props {
  current: CurrentWeather | null;
  forecast: ForecastDay[];
  plan?: PlanProp | null;
  plans?: PlanProp[];
}

const BANNER_STYLES: Record<WeatherTone, string> = {
  storm: 'from-rose-600 to-red-700',
  rain: 'from-indigo-600 to-blue-700',
  hot: 'from-orange-500 to-amber-600',
  wet: 'from-sky-600 to-blue-700',
  good: 'from-emerald-600 to-green-700',
};

function firstSentence(text: string, max = 120): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  const dot = trimmed.search(/[.।]/);
  const sentence = dot > 0 ? trimmed.slice(0, dot + 1) : trimmed;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}...` : sentence;
}

export default function TodayActionBanner({ current, forecast, plan, plans = [] }: Props) {
  const locale = useLocale();
  const appLocale = toAppLocale(locale);
  const t = (en: string, hi: string, ta: string) => (appLocale === 'ta' ? ta : appLocale === 'hi' ? hi : en);
  const cropLabel = (crop?: string) => {
    const labels: Record<string, { hi: string; ta: string }> = {
      Chilli: { hi: 'मिर्च', ta: 'மிளகாய்' },
      'Green Chilli': { hi: 'हरी मिर्च', ta: 'பச்சை மிளகாய்' },
      Tomato: { hi: 'टमाटर', ta: 'தக்காளி' },
      Brinjal: { hi: 'बैंगन', ta: 'கத்தரிக்காய்' },
      'Black gram': { hi: 'उड़द', ta: 'உளுந்து' },
      Rice: { hi: 'चावल', ta: 'அரிசி' },
      Paddy: { hi: 'धान', ta: 'நெல்' },
      Banana: { hi: 'केला', ta: 'வாழை' },
    };
    if (!crop || appLocale === 'en') return crop;
    return labels[crop]?.[appLocale] ?? crop;
  };

  if (!current || !forecast.length) return null;

  const activePlans = plan ? [plan] : plans;
  const verdict = weatherVerdict(forecast, locale);
  const today = new Date().toISOString().split('T')[0];
  const planSteps = activePlans.map((item) => ({ plan: item, step: nextStepFromPlan(item, today) }));
  const selected = planSteps.find((item) => item.step?.state === 'active') ?? planSteps[0];
  const selectedPlan = selected?.plan ?? null;
  const selectedStep = selected?.step ?? null;
  const weatherUrgent = verdict.tone === 'storm' || verdict.tone === 'rain';
  const localizedCropName = cropLabel(selectedPlan?.crop_name);

  let icon = <CloudSun className="h-7 w-7" />;
  let headline = verdict.title;
  let sub = verdict.action;

  if (!weatherUrgent && selectedStep?.state === 'active') {
    icon = <Sprout className="h-7 w-7" />;
    headline = t(
      `Today on your ${localizedCropName ?? 'crop'}: ${selectedStep.label}`,
      `आज आपकी ${localizedCropName ?? 'फसल'} पर: ${selectedStep.label}`,
      `இன்று உங்கள் ${localizedCropName ?? 'பயிர்'}: ${selectedStep.label}`,
    );
    sub = selectedStep.alert && selectedStep.alertAdvice
      ? selectedStep.alertAdvice
      : selectedStep.tasks
        ? firstSentence(selectedStep.tasks)
        : verdict.action;
  } else if (!weatherUrgent && selectedStep?.state === 'upcoming' && selectedStep.daysAway <= 5) {
    icon = <Sprout className="h-7 w-7" />;
    headline = t(
      `Coming up: ${selectedStep.label} in ${selectedStep.daysAway} day${selectedStep.daysAway === 1 ? '' : 's'}`,
      `आने वाला: ${selectedStep.daysAway} दिन में ${selectedStep.label}`,
      `வரவிருப்பது: ${selectedStep.daysAway} நாளில் ${selectedStep.label}`,
    );
    sub = selectedStep.tasks ? firstSentence(selectedStep.tasks) : verdict.action;
  }

  return (
    <div className={`mb-5 rounded-xl bg-gradient-to-r ${BANNER_STYLES[verdict.tone]} p-4 text-white shadow-lg sm:p-5`}>
      <div className="flex items-center gap-4">
        <div className="shrink-0 rounded-full bg-white/20 p-3">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
            {t("Today's plan", 'आज की योजना', 'இன்றைய திட்டம்')}
          </p>
          <p className="text-lg font-bold leading-snug">{headline}</p>
          <p className="mt-0.5 text-sm text-white/90">{sub}</p>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
              {verdict.emoji} {current.temp}&deg;C - {verdict.title}
            </span>
            {activePlans.map((item) => item.crop_name && (
              <Link key={item.crop_name} href="/crop-plan" className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 transition-colors hover:bg-white/25">
                <Sprout className="h-3 w-3" /> {cropLabel(item.crop_name)}
                <ArrowRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
