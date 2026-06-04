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
  plan: PlanProp | null;
}

const BANNER_STYLES: Record<WeatherTone, string> = {
  storm: 'from-rose-600 to-red-700',
  rain:  'from-indigo-600 to-blue-700',
  hot:   'from-orange-500 to-amber-600',
  wet:   'from-sky-600 to-blue-700',
  good:  'from-emerald-600 to-green-700',
};

/** First sentence of a (possibly long) task description, for a quick headline. */
function firstSentence(text: string, max = 120): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  const dot = trimmed.search(/[.।]/);
  const sentence = dot > 0 ? trimmed.slice(0, dot + 1) : trimmed;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

export default function TodayActionBanner({ current, forecast, plan }: Props) {
  const locale = useLocale();
  const appLocale = toAppLocale(locale);
  const t = (en: string, hi: string, ta: string) => (appLocale === 'ta' ? ta : appLocale === 'hi' ? hi : en);

  // No weather → nothing useful to lead with; hide the banner entirely.
  if (!current || !forecast.length) return null;

  const verdict = weatherVerdict(forecast, locale);
  const today = new Date().toISOString().split('T')[0];
  const step = nextStepFromPlan(plan, today);
  const weatherUrgent = verdict.tone === 'storm' || verdict.tone === 'rain';

  // Decide the single headline: urgent weather wins, then an active crop task,
  // then an upcoming crop task, otherwise the general weather suggestion.
  let icon = <CloudSun className="h-7 w-7" />;
  let headline = verdict.title;
  let sub = verdict.action;

  if (weatherUrgent) {
    headline = verdict.title;
    sub = verdict.action;
  } else if (step?.state === 'active') {
    icon = <Sprout className="h-7 w-7" />;
    headline = t(
      `Today on your ${plan?.crop_name ?? 'crop'}: ${step.label}`,
      `आज आपकी ${plan?.crop_name ?? 'फसल'} पर: ${step.label}`,
      `இன்று உங்கள் ${plan?.crop_name ?? 'பயிர்'}: ${step.label}`,
    );
    sub = step.alert && step.alertAdvice ? step.alertAdvice : (step.tasks ? firstSentence(step.tasks) : verdict.action);
  } else if (step?.state === 'upcoming' && step.daysAway <= 5) {
    icon = <Sprout className="h-7 w-7" />;
    headline = t(
      `Coming up: ${step.label} in ${step.daysAway} day${step.daysAway === 1 ? '' : 's'}`,
      `आने वाला: ${step.daysAway} दिन में ${step.label}`,
      `வரவிருப்பது: ${step.daysAway} நாளில் ${step.label}`,
    );
    sub = step.tasks ? firstSentence(step.tasks) : verdict.action;
  }

  return (
    <div className={`bg-gradient-to-r ${BANNER_STYLES[verdict.tone]} text-white rounded-2xl p-5 shadow-lg mb-6`}>
      <div className="flex items-center gap-4">
        <div className="rounded-full bg-white/20 p-3 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
            {t("Today's plan", 'आज की योजना', 'இன்றைய திட்டம்')}
          </p>
          <p className="text-lg font-bold leading-snug">{headline}</p>
          <p className="mt-0.5 text-sm text-white/90 line-clamp-2">{sub}</p>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
              {verdict.emoji} {current.temp}&deg;C · {verdict.title}
            </span>
            {plan?.crop_name && (
              <Link href="/crop-plan" className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 hover:bg-white/25 transition-colors">
                <Sprout className="h-3 w-3" /> {plan.crop_name}
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
