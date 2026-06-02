'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Droplets, Wind, ThermometerSun, AlertTriangle } from 'lucide-react';
import type { CurrentWeather, ForecastDay } from '@/lib/weather';

export default function WeatherWidget() {
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const t = useTranslations('weather');

  useEffect(() => {
    fetch('/api/weather').then(r => r.json()).then(data => {
      if (data.error) { setError(data.error); return; }
      setCurrent(data.current);
      setForecast(data.forecast ?? []);
    }).catch(() => setError('unavailable'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="bg-white rounded-2xl p-5 shadow animate-pulse h-48" />;
  if (error) return (
    <div className="bg-white rounded-2xl p-5 shadow border border-red-100 flex items-center gap-2 text-red-500">
      <AlertTriangle className="w-5 h-5" /> {t('unavailable')}
    </div>
  );

  return (
    <div className="bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-2xl p-5 shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sky-100 text-sm">{current?.city}</p>
          <p className="text-5xl font-bold">{current?.temp}°C</p>
          <p className="text-sky-100 capitalize mt-1">{current?.description}</p>
        </div>
        <span className="text-5xl leading-none">{current?.emoji}</span>
      </div>
      <div className="flex gap-4 text-sm text-sky-100 mb-4">
        <span className="flex items-center gap-1"><Droplets className="w-4 h-4" />{current?.humidity}%</span>
        <span className="flex items-center gap-1"><Wind className="w-4 h-4" />{current?.wind_speed} km/h</span>
        <span className="flex items-center gap-1"><ThermometerSun className="w-4 h-4" />{t('feels', { temp: current?.feels_like ?? '' })}</span>
      </div>
      <div className="border-t border-sky-400 pt-3">
        <p className="text-xs text-sky-200 mb-2">{t('forecast')}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {forecast.slice(0, 16).map(d => (
            <div key={d.date} className="flex-shrink-0 text-center bg-white/10 rounded-lg p-2 min-w-[54px]">
              <p className="text-xs text-sky-200">{new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}</p>
              <span className="text-xl leading-none block my-1">{d.emoji}</span>
              <p className="text-xs font-medium">{d.temp_max}°</p>
              <p className="text-xs text-sky-300">{d.temp_min}°</p>
              {d.rain_mm > 0 && <p className="text-xs text-blue-200">{d.rain_mm}mm</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
