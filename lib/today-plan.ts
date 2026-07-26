import { weatherVerdict, nextStepFromPlan, type WeatherVerdict } from './farm-advice';
import type { ForecastDay } from './weather';

/**
 * Turns the farmer's active crop plan(s) + weather + soil into a tight,
 * one-screen "what to do today" view:
 *  - weatherAlert: ONLY surfaced when the week is bad for the crop (no noise
 *    on normal days).
 *  - todayTasks: the active stage's actions, broken into tappable bullets.
 *  - prepareAhead: upcoming-stage prep so the farmer can act today for what's
 *    coming (buy seed, arrange labour, etc.).
 *
 * This is the deterministic source of truth; the Today screen renders it
 * instantly and an AI "focus" line (see app/api/today) layers warmth on top.
 */

export interface TodayTask {
  crop: string;
  text: string;
  /** True for an adverse-weather action pulled from the plan. */
  alert?: boolean;
}

export interface PrepItem {
  crop: string;
  text: string;
  daysAway: number;
}

export interface TodayPlan {
  hasActivePlan: boolean;
  /** Present only when the weather actually threatens the crop. */
  weatherAlert: WeatherVerdict | null;
  todayTasks: TodayTask[];
  prepareAhead: PrepItem[];
}

interface MilestoneLike {
  label?: string;
  summary?: string;
  date?: string;
  endDate?: string;
  tasks?: string;
  alert?: boolean;
  alertAdvice?: string;
}

interface PlanLike {
  crop_name?: string;
  milestones?: MilestoneLike[];
}

function splitTask(task?: string, limit = 3): string[] {
  if (!task) return [];
  return task
    .split(/[.;\n]|(?:\s-\s)/)
    .map((part) => part.replace(/^[\s•\-*]+/, '').trim())
    .filter((part) => part.length > 3)
    .slice(0, limit);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function buildTodayPlan({
  plans,
  forecast,
  locale,
  today,
}: {
  plans: PlanLike[];
  forecast: ForecastDay[];
  locale: string;
  today: string;
}): TodayPlan {
  const verdict = weatherVerdict(forecast, locale);
  const weatherAlert = verdict.tone === 'good' ? null : verdict;

  const todayTasks: TodayTask[] = [];
  const prepareAhead: PrepItem[] = [];

  for (const plan of plans) {
    const crop = plan.crop_name || 'your crop';
    const step = nextStepFromPlan(plan, today);

    if (step && step.state === 'active') {
      for (const bit of splitTask(step.tasks)) {
        todayTasks.push({ crop, text: bit });
      }
      if (step.alert && step.alertAdvice) {
        todayTasks.push({ crop, text: step.alertAdvice, alert: true });
      }
    } else if (step && step.state === 'upcoming') {
      // Nothing active today, but the next stage is coming — surface prep below.
      prepareAhead.push({
        crop,
        text: step.label || 'next stage',
        daysAway: step.daysAway,
      });
    }

    // Upcoming stages within ~10 days → "prepare ahead".
    for (const m of plan.milestones ?? []) {
      if (!m.date || m.date <= today) continue;
      const away = daysBetween(today, m.date);
      if (away <= 0 || away > 10) continue;
      const label = m.summary || m.label || 'next stage';
      if (!prepareAhead.some((p) => p.crop === crop && p.text === label)) {
        prepareAhead.push({ crop, text: label, daysAway: away });
      }
    }
  }

  prepareAhead.sort((a, b) => a.daysAway - b.daysAway);

  return {
    hasActivePlan: plans.length > 0,
    weatherAlert,
    todayTasks: todayTasks.slice(0, 8),
    prepareAhead: prepareAhead.slice(0, 4),
  };
}
