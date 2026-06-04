'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, CalendarDays, CloudRain, Droplets, Sprout, ThermometerSun, Wind } from 'lucide-react';
import type { CurrentWeather, ForecastDay } from '@/lib/weather';
import { currentWeatherFlags, toAppLocale, weatherVerdict } from '@/lib/farm-advice';

interface Props {
  current: CurrentWeather | null;
  forecast: ForecastDay[];
}

// Tone → background/border styling for the verdict hero and chips.
const TONE_STYLES: Record<string, { gradient: string; chip: string }> = {
  storm: { gradient: 'from-slate-700 to-slate-900', chip: 'bg-amber-400/25 border-amber-200' },
  rain:  { gradient: 'from-sky-600 to-indigo-700',  chip: 'bg-sky-300/25 border-sky-200' },
  hot:   { gradient: 'from-orange-500 to-amber-600', chip: 'bg-orange-300/25 border-orange-200' },
  wet:   { gradient: 'from-sky-500 to-blue-600',     chip: 'bg-sky-300/25 border-sky-200' },
  good:  { gradient: 'from-sky-500 to-blue-600',     chip: 'bg-emerald-300/25 border-emerald-200' },
};

export default function WeatherWidget({ current, forecast }: Props) {
  const [selectedDay, setSelectedDay] = useState<ForecastDay | null>(null);
  const t = useTranslations('weather');
  const locale = useLocale();
  const appLocale = toAppLocale(locale);

  function formatDay(date: string) {
    const dateLocale = locale === 'ta' ? 'ta-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN';
    return new Date(date + 'T00:00:00').toLocaleDateString(dateLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
  }

  function fieldRisk(day: ForecastDay) {
    const condition = day.description.toLowerCase();
    if (condition.includes('thunder') || day.rain_mm >= 20 || day.temp_max >= 38) {
      return appLocale === 'ta' ? 'அதிகம்' : appLocale === 'hi' ? 'अधिक' : 'High';
    }
    if (day.rain_mm >= 5 || condition.includes('rain') || condition.includes('drizzle') || day.temp_max >= 35) {
      return appLocale === 'ta' ? 'நடுத்தரம்' : appLocale === 'hi' ? 'मध्यम' : 'Medium';
    }
    return appLocale === 'ta' ? 'குறைவு' : appLocale === 'hi' ? 'कम' : 'Low';
  }

  function dayGuidance(day: ForecastDay): string {
    const condition = day.description.toLowerCase();
    const when = formatDay(day.date);
    if (condition.includes('thunder')) return `Thunderstorm risk on ${when}. Do not spray, avoid open-field work during lightning, and secure young plants.`;
    if (day.rain_mm >= 20) return `${day.rain_mm} mm rain on ${when}. Keep drainage open, avoid fertilizer, and delay sowing or harvesting.`;
    if (day.rain_mm >= 5) return `${day.rain_mm} mm rain likely on ${when}. Reduce irrigation and avoid spraying before rain.`;
    if (condition.includes('rain') || condition.includes('drizzle')) return `Light wet weather on ${when}. Check soil moisture before irrigation and watch for fungal issues.`;
    if (day.temp_max >= 36) return `${day.temp_max}°C heat on ${when}. Irrigate early morning or evening and avoid midday transplanting.`;
    if (condition.includes('cloud') || condition.includes('overcast')) return `${day.description} on ${when}. Good for weeding and inspection; irrigate only if soil is dry.`;
    return `Clear weather on ${when}. Good day for weeding, fertilizer, crop inspection, and routine field work.`;
  }

  if (!current) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow border border-red-100 flex items-center gap-2 text-red-500">
        <AlertTriangle className="w-5 h-5" /> {t('unavailable')}
      </div>
    );
  }

  const week = forecast.slice(0, 7);
  const verdict = weatherVerdict(forecast, locale);
  const flags = currentWeatherFlags(current, locale);
  const tone = TONE_STYLES[verdict.tone] ?? TONE_STYLES.good;

  return (
    <div className={`bg-gradient-to-br ${tone.gradient} text-white rounded-2xl p-5 shadow-lg`}>
      {/* Verdict hero — the one-glance conclusion leads. */}
      <div className="flex items-start gap-4">
        <span className="text-5xl leading-none">{verdict.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold leading-snug">{verdict.title}</p>
          <p className="mt-1 text-sm text-white/90">{verdict.detail}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold leading-none">{current.temp}&deg;</p>
          <p className="text-[11px] text-white/70 mt-1">{current.city}</p>
        </div>
      </div>

      {/* Today's conditions — small chips, not the headline. */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/90">
        <span className="flex items-center gap-1"><ThermometerSun className="w-3.5 h-3.5" />{t('feels', { temp: current.feels_like })}</span>
        <span className="flex items-center gap-1"><Droplets className="w-3.5 h-3.5" />{current.humidity}%</span>
        <span className="flex items-center gap-1"><Wind className="w-3.5 h-3.5" />{current.wind_speed} km/h</span>
        <span className="capitalize text-white/70">{current.description}</span>
      </div>

      {/* The single most important action. */}
      <div className={`mt-4 rounded-xl border p-3 ${tone.chip}`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-white/20 p-2">
            {verdict.tone === 'storm' ? <AlertTriangle className="h-4 w-4 text-amber-100" /> : <Sprout className="h-4 w-4 text-white" />}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              {appLocale === 'ta' ? 'இன்று செய்ய வேண்டியது' : appLocale === 'hi' ? 'क्या करें' : 'What to do'}
            </p>
            <p className="mt-0.5 text-sm text-white/95">{verdict.action}</p>
          </div>
        </div>
      </div>

      {/* Interpreted cautions for today (only shown when relevant). */}
      {flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {flags.map((f) => (
            <span key={f.kind} className="rounded-full bg-white/15 px-2.5 py-1 text-xs text-white/90">
              {f.kind === 'humidity' ? '💧' : f.kind === 'wind' ? '🌬️' : '🔥'} {f.text}
            </span>
          ))}
        </div>
      )}

      {/* Compact 7-day strip — secondary, tap any day for detail. */}
      <div className="border-t border-white/25 mt-4 pt-3">
        <p className="text-xs text-white/70 mb-2">
          {appLocale === 'ta' ? '7 நாள் முன்னறிவிப்பு (விவரத்திற்கு தட்டவும்)' : appLocale === 'hi' ? '7-दिन का पूर्वानुमान (विवरण हेतु टैप करें)' : '7-Day Forecast (tap a day)'}
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {week.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDay(d)}
              className="text-center rounded-lg p-1.5 bg-white/10 hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/70"
            >
              <p className="text-[11px] text-white/70">
                {new Date(d.date + 'T00:00:00').toLocaleDateString(locale === 'ta' ? 'ta-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short' })}
              </p>
              <span className="text-lg leading-none block my-0.5">{d.emoji}</span>
              <p className="text-[11px] font-medium">{d.temp_max}&deg;</p>
              {d.rain_mm > 0 && <p className="text-[10px] text-sky-200">{d.rain_mm}mm</p>}
            </button>
          ))}
        </div>
      </div>

      {selectedDay && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/85 p-4 backdrop-blur-sm"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 text-gray-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDay(selectedDay.date)}
                </p>
                <h3 className="mt-1 text-xl font-bold text-gray-900 capitalize">{selectedDay.description}</h3>
              </div>
              <span className="text-4xl leading-none">{selectedDay.emoji}</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-orange-50 p-3">
                <ThermometerSun className="mb-2 h-4 w-4 text-orange-500" />
                <p className="text-xs text-gray-500">{appLocale === 'ta' ? 'வெப்பநிலை' : appLocale === 'hi' ? 'तापमान' : 'Temperature'}</p>
                <p className="font-bold">{selectedDay.temp_min}&deg; - {selectedDay.temp_max}&deg;C</p>
              </div>
              <div className="rounded-lg bg-sky-50 p-3">
                <CloudRain className="mb-2 h-4 w-4 text-sky-500" />
                <p className="text-xs text-gray-500">{appLocale === 'ta' ? 'மழை' : appLocale === 'hi' ? 'बारिश' : 'Rainfall'}</p>
                <p className="font-bold">{selectedDay.rain_mm} mm</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                <Sprout className="mb-2 h-4 w-4 text-emerald-500" />
                <p className="text-xs text-gray-500">{appLocale === 'ta' ? 'வயல் ஆபத்து' : appLocale === 'hi' ? 'खेत जोखिम' : 'Field risk'}</p>
                <p className="font-bold">{fieldRisk(selectedDay)}</p>
              </div>
            </div>

            <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-gray-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <p>{dayGuidance(selectedDay)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
