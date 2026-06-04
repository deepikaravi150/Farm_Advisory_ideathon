'use client';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ListChecks, ArrowRight, Sprout, AlertTriangle, CalendarClock } from 'lucide-react';
import { nextStepFromPlan } from '@/lib/farm-advice';

export interface PlanItem {
  crop_name?: string;
  status?: string;
  milestones?: Array<{ label?: string; date?: string; endDate?: string; tasks?: string; alert?: boolean; alertAdvice?: string }>;
}

interface Props {
  plan: PlanItem | null;
}

export default function CropPlanNextStepWidget({ plan }: Props) {
  const locale = useLocale();
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);

  if (!plan) {
    return (
      <div className="bg-white rounded-2xl shadow border border-gray-100 flex flex-col">
        <div className="flex items-center gap-2 p-4 border-b border-gray-100">
          <ListChecks className="w-4 h-4 text-brand-600" />
          <h3 className="font-semibold text-gray-700">{t('Your Crop Plan', 'आपकी फसल योजना', 'உங்கள் பயிர் திட்டம்')}</h3>
        </div>
        <Link href="/crop-plan" className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-gray-500 hover:bg-gray-50">
          <Sprout className="h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">{t('Create your crop plan', 'अपनी फसल योजना बनाएं', 'உங்கள் பயிர் திட்டத்தை உருவாக்கவும்')}</p>
          <p className="text-xs">{t('A full season roadmap from sowing to selling', 'बुवाई से बिक्री तक पूरा मौसम रोडमैप', 'விதைப்பு முதல் விற்பனை வரை முழு பருவ வழித்தடம்')}</p>
        </Link>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const step = nextStepFromPlan(plan, today);
  const dateLocale = locale === 'ta' ? 'ta-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN';
  const fmt = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }) : '');

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <ListChecks className="w-4 h-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">{t('Your Crop Plan', 'आपकी फसल योजना', 'உங்கள் பயிர் திட்டம்')}</h3>
        <Link href="/crop-plan" className="ml-auto flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
          {t('Open', 'खोलें', 'திற')} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <Sprout className="h-4 w-4 text-brand-600" /> {plan.crop_name}
        </p>

        {!step ? (
          <p className="mt-2 text-sm text-gray-500">{t('Plan complete — well done!', 'योजना पूरी — बढ़िया!', 'திட்டம் முடிந்தது — அருமை!')}</p>
        ) : (
          <div className="mt-3 rounded-xl bg-brand-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
              <CalendarClock className="h-3.5 w-3.5" />
              {step.state === 'active'
                ? t('Now', 'अभी', 'இப்போது')
                : t(`In ${step.daysAway} day${step.daysAway === 1 ? '' : 's'}`, `${step.daysAway} दिन में`, `${step.daysAway} நாளில்`)}
              {' · '}{fmt(step.date)}{step.endDate ? ` – ${fmt(step.endDate)}` : ''}
            </p>
            <p className="mt-1 font-medium text-gray-800">{step.label}</p>
            {step.tasks && <p className="mt-1 text-sm text-gray-600 line-clamp-3">{step.tasks}</p>}
            {step.alert && step.alertAdvice && (
              <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {step.alertAdvice}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
