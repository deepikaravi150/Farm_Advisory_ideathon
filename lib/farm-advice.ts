import type { CurrentWeather, ForecastDay } from './weather';

/**
 * Plain-language farm advice derived from raw weather data.
 *
 * The goal is to convert meteorologist-style numbers (mm, km/h, %) into a single
 * "what does this mean for my field" verdict plus one concrete action. This is the
 * shared source of truth for both the WeatherWidget and the TodayActionBanner so
 * they never disagree.
 */

export type WeatherTone = 'storm' | 'rain' | 'hot' | 'wet' | 'good';
export type AppLocale = 'en' | 'hi' | 'ta';

export interface WeatherVerdict {
  tone: WeatherTone;
  emoji: string;
  /** Big headline — the one-glance conclusion. */
  title: string;
  /** The single most important detail (e.g. when rain returns). */
  detail: string;
  /** What the farmer should actually do about it. */
  action: string;
}

export interface WeatherFlag {
  kind: 'humidity' | 'wind' | 'heat';
  /** Short farmer-facing interpretation. */
  text: string;
}

export function toAppLocale(raw: string | undefined): AppLocale {
  return raw === 'ta' || raw === 'hi' ? raw : 'en';
}

function picker(locale: AppLocale) {
  return (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);
}

export function formatDayShort(date: string, locale: AppLocale): string {
  const dateLocale = locale === 'ta' ? 'ta-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN';
  return new Date(`${date}T00:00:00`).toLocaleDateString(dateLocale, { weekday: 'long' });
}

/**
 * Turn the 7-day forecast into one verdict (title + key detail + action),
 * prioritising danger: storm > heavy rain > heat > wet > good.
 */
export function weatherVerdict(
  forecast: ForecastDay[],
  localeRaw: string,
): WeatherVerdict {
  const locale = toAppLocale(localeRaw);
  const t = picker(locale);
  const week = forecast.slice(0, 7);

  const thunderDays = week.filter((d) => d.description.toLowerCase().includes('thunder'));
  const rainyDays = week.filter((d) => d.rain_mm > 0);
  const heavyRainDays = week.filter((d) => d.rain_mm >= 10);
  const totalRain = Math.round(week.reduce((s, d) => s + (d.rain_mm ?? 0), 0) * 10) / 10;
  const hottest = week.reduce<ForecastDay | null>((m, d) => (!m || d.temp_max > m.temp_max ? d : m), null);
  const peak = hottest?.temp_max ?? 0;
  // First meaningfully wet day in the week — used to tell the farmer *when* rain returns.
  const firstWet = week.find((d) => d.rain_mm >= 5 || d.description.toLowerCase().includes('rain'));

  if (thunderDays.length) {
    const n = thunderDays.length;
    const day = formatDayShort(thunderDays[0].date, locale);
    return {
      tone: 'storm',
      emoji: '⛈️',
      title: t('Storm warning this week', 'इस सप्ताह तूफान की चेतावनी', 'இந்த வாரம் புயல் எச்சரிக்கை'),
      detail: t(
        `Thunderstorms likely on ${n} day${n > 1 ? 's' : ''}, starting ${day}.`,
        `${n} दिन आंधी-तूफान संभव, ${day} से शुरू।`,
        `${n} நாள் இடியுடன் மழை வாய்ப்பு, ${day} முதல்.`,
      ),
      action: t(
        'Do not spray or work in open fields during lightning. Keep drainage open and secure young plants.',
        'बिजली के दौरान छिड़काव या खुले खेत का काम न करें। जल निकासी खुली रखें और नई फसल सुरक्षित करें।',
        'மின்னல் நேரத்தில் தெளிப்பு அல்லது வயல் பணி வேண்டாம். வடிகாலை திறந்து வைத்து இளம் பயிர்களை பாதுகாக்கவும்.',
      ),
    };
  }

  if (heavyRainDays.length) {
    const day = firstWet ? formatDayShort(firstWet.date, locale) : '';
    const mm = firstWet?.rain_mm ?? heavyRainDays[0].rain_mm;
    return {
      tone: 'rain',
      emoji: '🌧️',
      title: t('Heavy rain on the way', 'भारी बारिश आने वाली है', 'கனமழை வரப்போகிறது'),
      detail: t(
        `Rain returns ${day} (${mm} mm). About ${totalRain} mm expected this week.`,
        `${day} को बारिश लौटेगी (${mm} मिमी)। इस सप्ताह लगभग ${totalRain} मिमी अनुमानित।`,
        `${day} அன்று மழை திரும்பும் (${mm} மி.மீ). இந்த வாரம் சுமார் ${totalRain} மி.மீ எதிர்பார்ப்பு.`,
      ),
      action: t(
        'Keep drains clear, avoid fertilizer before rain, and delay sowing or harvesting around wet days.',
        'नालियां साफ रखें, बारिश से पहले खाद न डालें और बारिश वाले दिनों में बुवाई/कटाई टालें।',
        'வடிகால்களை சுத்தமாக வைத்து, மழைக்கு முன் உரமிடாமல், ஈர நாட்களில் விதைப்பு/அறுவடையை தள்ளிப்போடவும்.',
      ),
    };
  }

  if (peak >= 35) {
    return {
      tone: 'hot',
      emoji: '🌡️',
      title: t('Hot week ahead', 'आगे गर्म सप्ताह', 'வரும் வாரம் வெப்பம்'),
      detail: t(
        `Afternoons up to ${peak}°C. ${rainyDays.length ? `Only ${rainyDays.length} light-rain day(s).` : 'Mostly dry.'}`,
        `दोपहर ${peak}°C तक। ${rainyDays.length ? `केवल ${rainyDays.length} हल्की बारिश वाले दिन।` : 'ज़्यादातर सूखा।'}`,
        `மதியம் ${peak}°C வரை. ${rainyDays.length ? `${rainyDays.length} லேசான மழை நாட்கள் மட்டும்.` : 'பெரும்பாலும் வறண்டது.'}`,
      ),
      action: t(
        'Irrigate early morning or evening. Watch nursery and vegetable crops for wilting; avoid midday transplanting.',
        'सुबह या शाम सिंचाई करें। नर्सरी और सब्जी फसलों में मुरझान देखें; दोपहर में रोपाई न करें।',
        'அதிகாலை அல்லது மாலையில் பாசனம் செய்யவும். நாற்று/காய்கறி பயிர்களில் வாடலை கவனித்து, மதிய நேர நடவை தவிர்க்கவும்.',
      ),
    };
  }

  if (rainyDays.length >= 3) {
    return {
      tone: 'wet',
      emoji: '🌦️',
      title: t('Wet week ahead', 'आगे नम सप्ताह', 'வரும் வாரம் ஈரம்'),
      detail: t(
        `Light rain on ${rainyDays.length} days · about ${totalRain} mm total.`,
        `${rainyDays.length} दिन हल्की बारिश · कुल लगभग ${totalRain} मिमी।`,
        `${rainyDays.length} நாட்கள் லேசான மழை · மொத்தம் சுமார் ${totalRain} மி.மீ.`,
      ),
      action: t(
        'Reduce irrigation, check soil moisture before watering, and watch for fungal disease on leaves.',
        'सिंचाई कम करें, पानी देने से पहले मिट्टी की नमी जांचें और पत्तियों पर फफूंद रोग देखें।',
        'பாசனத்தை குறைத்து, நீர் பாய்ச்சும் முன் மண் ஈரப்பதத்தை சரிபார்த்து, இலைகளில் பூஞ்சை நோயை கவனிக்கவும்.',
      ),
    };
  }

  return {
    tone: 'good',
    emoji: '☀️',
    title: t('Mostly sunny & dry', 'ज़्यादातर धूप और सूखा', 'பெரும்பாலும் வெயிலும் வறட்சியும்'),
    detail: t(
      `Good week for field work. ${rainyDays.length ? `${rainyDays.length} light-rain day(s) only.` : 'No rain expected.'}`,
      `खेत के काम के लिए अच्छा सप्ताह। ${rainyDays.length ? `केवल ${rainyDays.length} हल्की बारिश वाले दिन।` : 'बारिश की संभावना नहीं।'}`,
      `வயல் பணிக்கு நல்ல வாரம். ${rainyDays.length ? `${rainyDays.length} லேசான மழை நாட்கள் மட்டும்.` : 'மழை எதிர்பார்ப்பு இல்லை.'}`,
    ),
    action: t(
      'Good days for spraying, weeding, fertilizer application, and harvesting. Spray only when leaves are dry.',
      'छिड़काव, निराई, खाद और कटाई के लिए अच्छे दिन। पत्तियां सूखी हों तभी छिड़काव करें।',
      'தெளிப்பு, களை எடுத்தல், உரமிடுதல், அறுவடைக்கு ஏற்ற நாட்கள். இலைகள் உலர்ந்திருந்தால் மட்டுமே தெளிக்கவும்.',
    ),
  };
}

/** Interpret today's raw conditions into farmer-relevant cautions (humidity/wind/heat). */
export function currentWeatherFlags(current: CurrentWeather | null, localeRaw: string): WeatherFlag[] {
  if (!current) return [];
  const locale = toAppLocale(localeRaw);
  const t = picker(locale);
  const flags: WeatherFlag[] = [];

  if (current.humidity >= 80) {
    flags.push({
      kind: 'humidity',
      text: t('High humidity — fungal disease risk', 'अधिक नमी — फफूंद रोग का खतरा', 'அதிக ஈரப்பதம் — பூஞ்சை நோய் அபாயம்'),
    });
  }
  if (current.wind_speed >= 20) {
    flags.push({
      kind: 'wind',
      text: t('Windy — avoid spraying today', 'तेज़ हवा — आज छिड़काव न करें', 'காற்று அதிகம் — இன்று தெளிப்பு வேண்டாம்'),
    });
  }
  if (current.temp >= 36) {
    flags.push({
      kind: 'heat',
      text: t('Very hot — irrigate early or late', 'बहुत गर्म — सुबह/शाम सिंचाई करें', 'மிக வெப்பம் — அதிகாலை/மாலை பாசனம்'),
    });
  }
  return flags;
}

export interface NextStep {
  /** Stage label. */
  label: string;
  /** What to do in this stage. */
  tasks: string;
  /** 'active' when today falls inside the stage, 'upcoming' when it starts later. */
  state: 'active' | 'upcoming';
  date: string;
  endDate?: string;
  /** Whole days from today until the stage starts (0 when active). */
  daysAway: number;
  alert?: boolean;
  alertAdvice?: string;
}

interface PlanMilestoneLike {
  label?: string;
  date?: string;
  endDate?: string;
  durationDays?: number;
  tasks?: string;
  alert?: boolean;
  alertAdvice?: string;
}

interface PlanLike {
  crop_name?: string;
  milestones?: PlanMilestoneLike[];
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Find the milestone the farmer should care about today: the active stage if one
 * contains today, otherwise the next upcoming stage. Returns null when the plan
 * is finished or has no dated milestones.
 */
export function nextStepFromPlan(plan: PlanLike | null | undefined, todayISO: string): NextStep | null {
  const milestones = (plan?.milestones ?? []).filter((m) => m?.date);
  if (!milestones.length) return null;

  const active = milestones.find((m) => {
    const end = m.endDate ?? m.date!;
    return m.date! <= todayISO && todayISO <= end;
  });
  const chosen = active ?? milestones.find((m) => m.date! > todayISO);
  if (!chosen) return null;

  return {
    label: chosen.label ?? '',
    tasks: chosen.tasks ?? '',
    state: active ? 'active' : 'upcoming',
    date: chosen.date!,
    endDate: chosen.endDate,
    daysAway: active ? 0 : Math.max(0, daysBetween(todayISO, chosen.date!)),
    alert: chosen.alert,
    alertAdvice: chosen.alertAdvice,
  };
}
