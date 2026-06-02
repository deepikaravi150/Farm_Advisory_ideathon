import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getCurrentWeather, get15DayForecast } from '@/lib/weather';
import { getItem, Tables } from '@/lib/aws/dynamodb';
import { extractCentroid } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId });
    if (!profile?.land_coordinates?.length) {
      // Default to Chennai coordinates if no land coordinates
      const lat = 13.0827;
      const lon = 80.2707;
      const [current, forecast] = await Promise.all([
        getCurrentWeather(lat, lon),
        get15DayForecast(lat, lon),
      ]);
      return NextResponse.json({ current, forecast });
    }

    const centroid = extractCentroid(profile.land_coordinates as Array<{ lat: number; lng: number }>);
    const [current, forecast] = await Promise.all([
      getCurrentWeather(centroid.lat, centroid.lng),
      get15DayForecast(centroid.lat, centroid.lng),
    ]);

    return NextResponse.json({ current, forecast });
  } catch (err) {
    console.error('Weather error:', err);
    return NextResponse.json({ error: 'Weather fetch failed' }, { status: 500 });
  }
}
