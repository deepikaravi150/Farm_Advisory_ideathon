'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, CalendarDays, CloudRain, Droplets, Sprout, ThermometerSun, Wind } from 'lucide-react';
import type { CurrentWeather, ForecastDay } from '@/lib/weather';

export default function WeatherWidget() {
  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<ForecastDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const t = useTranslations('weather');
  const locale = useLocale();

  useEffect(() => {
    fetch('/api/weather').then(r => r.json()).then(data => {
      if (data.error) { setError(data.error); return; }
      setCurrent(data.current);
      const days = data.forecast ?? [];
      setForecast(days);
      setSelectedDay(null);
    }).catch(() => setError('unavailable'))
      .finally(() => setLoading(false));
  }, []);

  function formatDay(date: string) {
    const dateLocale = locale === 'ta' ? 'ta-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN';
    return new Date(date + 'T00:00:00').toLocaleDateString(dateLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
  }

  function farmAdvice(day: ForecastDay) {
    const condition = day.description.toLowerCase();
    if (condition.includes('thunder')) return `Thunderstorm risk on ${formatDay(day.date)}. Do not spray pesticide, avoid field work during lightning, and secure young plants.`;
    if (day.rain_mm >= 20) return `${day.rain_mm} mm rain expected on ${formatDay(day.date)}. Keep drainage open, avoid fertilizer application, and delay harvesting or sowing.`;
    if (day.rain_mm >= 5) return `${day.rain_mm} mm rain is likely on ${formatDay(day.date)}. Reduce irrigation and avoid spraying before rain.`;
    if (condition.includes('rain') || condition.includes('drizzle')) return `Light wet weather expected on ${formatDay(day.date)}. Check soil moisture before irrigation and watch for fungal issues.`;
    if (day.temp_max >= 36) return `${day.temp_max}°C heat expected on ${formatDay(day.date)}. Irrigate early morning or evening and avoid transplanting at noon.`;
    if (condition.includes('fog')) return `Foggy conditions on ${formatDay(day.date)}. Delay spraying until leaves are dry and inspect crops for fungal symptoms.`;
    if (condition.includes('overcast') || condition.includes('cloud')) return `${day.description} on ${formatDay(day.date)}. Good for weeding and field inspection; irrigate only if soil is dry.`;
    return `Clear weather on ${formatDay(day.date)}. Good day for weeding, fertilizer planning, crop inspection, and routine field work.`;
  }

  function fieldRisk(day: ForecastDay) {
    const condition = day.description.toLowerCase();
    if (condition.includes('thunder') || day.rain_mm >= 20 || day.temp_max >= 38) return 'High';
    if (day.rain_mm >= 5 || condition.includes('rain') || condition.includes('drizzle') || day.temp_max >= 35) return 'Medium';
    return 'Low';
  }

  function guidanceList(day: ForecastDay) {
    const condition = day.description.toLowerCase();
    const items = [farmAdvice(day)];
    if (day.rain_mm > 0) items.push('Check soil moisture before irrigation and keep low areas drained.');
    else items.push('Use the dry window for weeding, field inspection, and fertilizer planning.');
    if (condition.includes('thunder')) items.push('Secure loose farm materials and avoid open-field work during lightning.');
    else if (day.temp_max >= 35) items.push('Warm conditions may increase crop water demand. Monitor wilting in vegetables and nursery crops.');
    else if (condition.includes('overcast') || condition.includes('cloud')) items.push('Cloudy weather is useful for crop scouting, but spray only if leaves are dry.');
    else items.push('Good visibility for pest inspection. Check leaf underside and new shoots.');
    return items;
  }

  function weeklySummary(days: ForecastDay[]) {
    const week = days.slice(0, 7);
    const thunderDays = week.filter((d) => d.description.toLowerCase().includes('thunder'));
    const rainyDays = week.filter((d) => d.rain_mm > 0);
    const heavyRainDays = week.filter((d) => d.rain_mm >= 10);
    const hottest = week.reduce<ForecastDay | null>((max, d) => !max || d.temp_max > max.temp_max ? d : max, null);
    const totalRain = week.reduce((sum, d) => sum + (d.rain_mm ?? 0), 0);

    if (thunderDays.length) {
      return {
        tone: 'alert',
        title: locale === 'ta' ? 'இந்த வாரம் இடியுடன் கூடிய மழை எச்சரிக்கை' : locale === 'hi' ? 'इस सप्ताह आंधी-तूफान की चेतावनी' : 'Thunderstorm watch this week',
        text: locale === 'ta'
          ? `${thunderDays.length} நாள் இடியுடன் கூடிய மழை இருக்கலாம். மின்னல் நேரத்தில் தெளிப்பு மற்றும் திறந்த வயல் பணிகளை தவிர்க்கவும்; வடிகாலையை தயார் வைத்து இளம் பயிர்களை பாதுகாக்கவும்.`
          : locale === 'hi'
            ? `${thunderDays.length} दिन आंधी-तूफान संभव है। बिजली के दौरान छिड़काव और खुले खेत का काम न करें; जल निकासी तैयार रखें और नई फसल को सुरक्षित करें।`
            : `${thunderDays.length} thunderstorm day${thunderDays.length > 1 ? 's' : ''} possible. Avoid spraying and open-field work during lightning; keep drainage ready and secure young crops.`,
        meta: locale === 'ta'
          ? `${rainyDays.length} மழை நாட்கள் · ${totalRain.toFixed(1)}மி.மீ மழை எதிர்பார்ப்பு`
          : locale === 'hi'
            ? `${rainyDays.length} बारिश वाले दिन · ${totalRain.toFixed(1)}मिमी बारिश अपेक्षित`
            : `${rainyDays.length} rainy days · ${totalRain.toFixed(1)}mm rain expected`,
      };
    }

    if (heavyRainDays.length) {
      return {
        tone: 'rain',
        title: locale === 'ta' ? 'இந்த வாரம் ஈரமான காலநிலை' : locale === 'hi' ? 'आगे बारिश वाला सप्ताह' : 'Wet week ahead',
        text: locale === 'ta'
          ? `${rainyDays.length} நாட்களில் மழை வாய்ப்பு உள்ளது. பாசனத்தை குறைத்து, மழைக்கு முன் உரமிடுவதை தவிர்த்து, தாழ்வான பகுதிகளில் நீர் தேங்காமல் பார்த்துக் கொள்ளவும்.`
          : locale === 'hi'
            ? `${rainyDays.length} दिन बारिश की संभावना है। सिंचाई कम करें, बारिश से पहले खाद न डालें और निचले क्षेत्रों में जल निकासी रखें।`
            : `Rain is likely on ${rainyDays.length} day${rainyDays.length > 1 ? 's' : ''}. Reduce irrigation, avoid fertilizer before rain, and keep low areas drained.`,
        meta: locale === 'ta'
          ? `மொத்த மழை ${totalRain.toFixed(1)}மி.மீ · அதிகபட்சம் ${hottest?.temp_max ?? '-'}°C`
          : locale === 'hi'
            ? `कुल बारिश ${totalRain.toFixed(1)}मिमी · अधिकतम ${hottest?.temp_max ?? '-'}°C`
            : `${totalRain.toFixed(1)}mm total rain · peak ${hottest?.temp_max ?? '-'}°C`,
      };
    }

    if ((hottest?.temp_max ?? 0) >= 35) {
      return {
        tone: 'heat',
        title: locale === 'ta' ? '7 நாள் வெப்பமான முன்னறிவிப்பு' : locale === 'hi' ? '7 दिन गर्म मौसम का अनुमान' : 'Warm 7-day outlook',
        text: locale === 'ta'
          ? `மதிய நேர வெப்பம் ${hottest?.temp_max}°C வரை இருக்கலாம். அதிகாலை அல்லது மாலை பாசனம் செய்து, நாற்று/காய்கறி பயிர்களில் வாடலை கவனிக்கவும்.`
          : locale === 'hi'
            ? `दोपहर का तापमान ${hottest?.temp_max}°C तक जा सकता है। सुबह या शाम सिंचाई करें और नर्सरी/सब्जी फसलों में मुरझाने पर ध्यान दें।`
            : `Expect warm afternoons up to ${hottest?.temp_max}°C. Irrigate early morning or evening and watch nursery/vegetable crops for wilting.`,
        meta: locale === 'ta'
          ? `${rainyDays.length} லேசான மழை நாட்கள் · ${totalRain.toFixed(1)}மி.மீ மழை`
          : locale === 'hi'
            ? `${rainyDays.length} हल्की बारिश वाले दिन · ${totalRain.toFixed(1)}मिमी बारिश`
            : `${rainyDays.length} light-rain days · ${totalRain.toFixed(1)}mm rain`,
      };
    }

    return {
      tone: 'good',
      title: locale === 'ta' ? 'வயல் பணிகளுக்கு நல்ல வாரம்' : locale === 'hi' ? 'खेत के काम के लिए अच्छा समय' : 'Good field-work window',
      text: locale === 'ta'
        ? 'அடுத்த வாரம் களை எடுப்பு, பயிர் கண்காணிப்பு மற்றும் வழக்கமான வயல் பணிகளுக்கு ஏற்றதாக தெரிகிறது. இலைகள் உலர்ந்திருந்தால் மட்டுமே தெளிக்கவும்.'
        : locale === 'hi'
          ? 'अगला सप्ताह निराई, फसल निरीक्षण और नियमित खेत कार्य के लिए अच्छा दिख रहा है। पत्तियां सूखी हों तभी छिड़काव करें।'
          : 'The next week looks mostly manageable for weeding, crop scouting, and routine field work. Spray only when leaves are dry.',
      meta: locale === 'ta'
        ? `${rainyDays.length} மழை நாட்கள் · ${totalRain.toFixed(1)}மி.மீ மழை · அதிகபட்சம் ${hottest?.temp_max ?? '-'}°C`
        : locale === 'hi'
          ? `${rainyDays.length} बारिश वाले दिन · ${totalRain.toFixed(1)}मिमी बारिश · अधिकतम ${hottest?.temp_max ?? '-'}°C`
          : `${rainyDays.length} rainy days · ${totalRain.toFixed(1)}mm rain · peak ${hottest?.temp_max ?? '-'}°C`,
    };
  }

  if (loading) return <div className="bg-white rounded-2xl p-5 shadow animate-pulse h-48" />;
  if (error) return (
    <div className="bg-white rounded-2xl p-5 shadow border border-red-100 flex items-center gap-2 text-red-500">
      <AlertTriangle className="w-5 h-5" /> {t('unavailable')}
    </div>
  );

  const weekForecast = forecast.slice(0, 7);
  const summary = weeklySummary(weekForecast);

  return (
    <div className="bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-2xl p-5 shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sky-100 text-sm">{current?.city}</p>
          <p className="text-5xl font-bold">{current?.temp}&deg;C</p>
          <p className="text-sky-100 capitalize mt-1">{current?.description}</p>
        </div>
        <span className="text-5xl leading-none">{current?.emoji}</span>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-sky-100 mb-4">
        <span className="flex items-center gap-1"><Droplets className="w-4 h-4" />{current?.humidity}%</span>
        <span className="flex items-center gap-1"><Wind className="w-4 h-4" />{current?.wind_speed} km/h</span>
        <span className="flex items-center gap-1"><ThermometerSun className="w-4 h-4" />{t('feels', { temp: current?.feels_like ?? '' })}</span>
      </div>

      <div className={`mb-4 rounded-xl border p-3 ${
        summary.tone === 'alert'
          ? 'border-amber-200 bg-amber-400/20'
          : summary.tone === 'rain'
            ? 'border-sky-200 bg-sky-300/20'
            : summary.tone === 'heat'
              ? 'border-orange-200 bg-orange-300/20'
              : 'border-emerald-200 bg-emerald-300/20'
      }`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-white/20 p-2">
            {summary.tone === 'alert' ? <AlertTriangle className="h-4 w-4 text-amber-100" /> : <CloudRain className="h-4 w-4 text-white" />}
          </div>
          <div>
            <p className="text-sm font-bold">{summary.title}</p>
            <p className="mt-1 text-sm text-white/90">{summary.text}</p>
            <p className="mt-2 text-xs font-medium text-white/75">{summary.meta}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-sky-400 pt-3">
        <p className="text-xs text-sky-200 mb-2">{locale === 'ta' ? '7 நாள் முன்னறிவிப்பு' : locale === 'hi' ? '7-दिन का पूर्वानुमान' : '7-Day Forecast'}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {weekForecast.map(d => {
            const selected = selectedDay?.date === d.date;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelectedDay(d)}
                className={`text-center rounded-lg p-2 min-h-[92px] transition-all focus:outline-none focus:ring-2 focus:ring-white/70 ${
                  selected ? 'bg-white text-blue-700 shadow-md' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <p className={`text-xs ${selected ? 'text-blue-500' : 'text-sky-200'}`}>
                  {new Date(d.date + 'T00:00:00').toLocaleDateString(locale === 'ta' ? 'ta-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short' })}
                </p>
                <span className="text-xl leading-none block my-1">{d.emoji}</span>
                <p className="text-xs font-medium">{d.temp_max}&deg;</p>
                <p className={`text-xs ${selected ? 'text-blue-500' : 'text-sky-300'}`}>{d.temp_min}&deg;</p>
                {d.rain_mm > 0 && <p className={`text-xs ${selected ? 'text-blue-600' : 'text-blue-200'}`}>{d.rain_mm}mm</p>}
              </button>
            );
          })}
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
                <h3 className="mt-1 text-xl font-bold text-gray-900">{selectedDay.description}</h3>
                <p className="text-sm text-gray-500">Forecast for your farm area</p>
              </div>
              <span className="text-4xl leading-none">{selectedDay.emoji}</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-orange-50 p-3">
                <ThermometerSun className="mb-2 h-4 w-4 text-orange-500" />
                <p className="text-xs text-gray-500">Temperature</p>
                <p className="font-bold">{selectedDay.temp_min}&deg; - {selectedDay.temp_max}&deg;C</p>
              </div>
              <div className="rounded-lg bg-sky-50 p-3">
                <CloudRain className="mb-2 h-4 w-4 text-sky-500" />
                <p className="text-xs text-gray-500">Rainfall</p>
                <p className="font-bold">{selectedDay.rain_mm} mm</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                <Sprout className="mb-2 h-4 w-4 text-emerald-500" />
                <p className="text-xs text-gray-500">Field risk</p>
                <p className="font-bold">{fieldRisk(selectedDay)}</p>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-gray-800">Farm guidance</p>
              <div className="space-y-2">
                {guidanceList(selectedDay).map((item) => (
                  <div key={item} className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-gray-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
