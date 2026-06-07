const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

export interface CurrentWeather {
  temp: number;
  feels_like: number;
  humidity: number;
  description: string;
  emoji: string;
  wind_speed: number;
  city: string;
}

export interface ForecastDay {
  date: string;
  temp_min: number;
  temp_max: number;
  description: string;
  emoji: string;
  rain_mm: number;
}

// WMO Weather Code mapping
const WMO: Record<number, { description: string; emoji: string }> = {
  0:  { description: 'Clear sky',          emoji: '☀️' },
  1:  { description: 'Mainly clear',       emoji: '🌤️' },
  2:  { description: 'Partly cloudy',      emoji: '⛅' },
  3:  { description: 'Overcast',           emoji: '☁️' },
  45: { description: 'Foggy',              emoji: '🌫️' },
  48: { description: 'Rime fog',           emoji: '🌫️' },
  51: { description: 'Light drizzle',      emoji: '🌦️' },
  53: { description: 'Drizzle',            emoji: '🌦️' },
  55: { description: 'Heavy drizzle',      emoji: '🌧️' },
  61: { description: 'Slight rain',        emoji: '🌧️' },
  63: { description: 'Rain',               emoji: '🌧️' },
  65: { description: 'Heavy rain',         emoji: '🌧️' },
  71: { description: 'Slight snow',        emoji: '🌨️' },
  73: { description: 'Snow',               emoji: '❄️' },
  75: { description: 'Heavy snow',         emoji: '❄️' },
  77: { description: 'Snow grains',        emoji: '🌨️' },
  80: { description: 'Rain showers',       emoji: '🌦️' },
  81: { description: 'Rain showers',       emoji: '🌧️' },
  82: { description: 'Violent showers',    emoji: '🌧️' },
  85: { description: 'Snow showers',       emoji: '🌨️' },
  86: { description: 'Heavy snow showers', emoji: '❄️' },
  95: { description: 'Thunderstorm',       emoji: '⛈️' },
  96: { description: 'Thunderstorm + hail',emoji: '⛈️' },
  99: { description: 'Thunderstorm + hail',emoji: '⛈️' },
};

function wmo(code: number): { description: string; emoji: string } {
  return WMO[code] ?? { description: 'Unknown', emoji: '🌡️' };
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { 'User-Agent': 'FarmAdvisor/1.0' }, next: { revalidate: 86400 } }
    );
    if (!res.ok) return 'Your Farm';
    const data = await res.json();
    const a = data.address ?? {};
    const place = a.village ?? a.town ?? a.city ?? a.county ?? a.state;
    return place ? `Farm near ${place}` : 'Your Farm';
  } catch {
    return 'Your Farm';
  }
}

export async function getCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  const url = `${BASE_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=Asia%2FKolkata`;
  const [res, city] = await Promise.all([
    fetch(url, { next: { revalidate: 1800 } }),
    reverseGeocode(lat, lon),
  ]);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const data = await res.json();
  const c = data.current;
  const { description, emoji } = wmo(c.weather_code);
  return {
    temp: Math.round(c.temperature_2m),
    feels_like: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    description,
    emoji,
    wind_speed: c.wind_speed_10m,
    city,
  };
}

export async function get15DayForecast(lat: number, lon: number): Promise<ForecastDay[]> {
  const url = `${BASE_URL}?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FKolkata&forecast_days=16`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Forecast API error: ${res.status}`);
  const data = await res.json();
  const d = data.daily;
  return (d.time as string[]).map((date: string, i: number) => {
    const { description, emoji } = wmo(d.weather_code[i]);
    return {
      date,
      temp_min: Math.round(d.temperature_2m_min[i]),
      temp_max: Math.round(d.temperature_2m_max[i]),
      description,
      emoji,
      rain_mm: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
    };
  });
}
