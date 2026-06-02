import type { ForecastDay } from '@/lib/weather';
import type { Milestone } from '@/lib/types/crop-plan';

/** Add N days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/** Inclusive end date of a stage from its start + duration. */
export function stageEndDate(m: Pick<Milestone, 'date' | 'endDate' | 'durationDays'>): string {
  if (m.endDate) return m.endDate;
  return addDays(m.date, Math.max(0, (m.durationDays ?? 1) - 1));
}

/** Adverse WMO-derived conditions worth warning a farmer about. */
function isStormy(description: string): boolean {
  const d = description.toLowerCase();
  return d.includes('thunderstorm') || d.includes('violent') || d.includes('hail');
}

/**
 * Annotate each milestone with the actual forecast for the days it spans
 * (only the next ~16 days are available) and flag weather alerts. Stages
 * beyond the forecast window keep just the AI's general weatherRequirement.
 */
export function annotateMilestonesWithWeather(
  milestones: Milestone[],
  forecast: ForecastDay[]
): Milestone[] {
  if (!Array.isArray(milestones)) return [];
  const byDate = new Map(forecast.map((f) => [f.date, f]));

  return milestones.map((m) => {
    const start = m.date;
    const end = stageEndDate(m);
    const days: ForecastDay[] = [];
    // Walk each calendar day in the stage and pick up any forecast we have.
    for (let cur = start; cur <= end; cur = addDays(cur, 1)) {
      const f = byDate.get(cur);
      if (f) days.push(f);
      if (days.length > 30) break; // guard against bad date ranges
    }

    const annotated: Milestone = { ...m, endDate: end };
    if (!days.length) return annotated;

    annotated.weatherSummary = days
      .map((d) => `${d.emoji} ${d.date}: ${d.description}, ${d.temp_min}–${d.temp_max}°C, rain ${d.rain_mm}mm`)
      .join('\n');

    // Alert when heavy rain (>=20mm/day) or a storm falls within the stage.
    const heavyRain = days.filter((d) => d.rain_mm >= 20);
    const storms = days.filter((d) => isStormy(d.description));
    if (heavyRain.length || storms.length) {
      const worst = [...storms, ...heavyRain];
      const dates = Array.from(new Set(worst.map((d) => d.date))).join(', ');
      annotated.alert = true;
      annotated.status = 'alert';
      annotated.alertAdvice =
        `Heavy rain/storm forecast on ${dates}. Avoid spraying or fertilizing on these days, ` +
        `ensure field drainage, and reschedule sowing/harvesting around the wet spell if possible.`;
    }
    return annotated;
  });
}

/** Compact forecast summary to feed the planning prompt so dates dodge bad weather. */
export function forecastSummaryForPrompt(forecast: ForecastDay[]): string {
  if (!forecast?.length) return '';
  return forecast
    .map((d) => `${d.date}: ${d.description}, ${d.temp_min}–${d.temp_max}°C, rain ${d.rain_mm}mm`)
    .join('\n');
}
