import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getItem, queryItems, Tables } from '@/lib/aws/dynamodb';
import { districtFromAddress, getSuitableCrops, type SoilSnapshot } from '@/lib/crop-suitability';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [profile, reports] = await Promise.all([
    getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId }),
    queryItems({
      TableName: Tables.SOIL_REPORTS,
      KeyConditionExpression: 'farmer_id = :fid',
      ExpressionAttributeValues: { ':fid': farmer.farmerId },
      ScanIndexForward: false,
      Limit: 10,
    }).catch(() => []),
  ]);

  const report = reports.find((r) => r.is_current) ?? reports[0];
  const soil: SoilSnapshot | null = report ? {
    ph: report.ph as number | string | null | undefined,
    nitrogen: report.nitrogen as string | null | undefined,
    phosphorus: report.phosphorus as string | null | undefined,
    potassium: report.potassium as string | null | undefined,
    organicCarbon: report.organic_carbon as string | null | undefined,
  } : null;

  const address = profile?.address as string | undefined;
  const crops = getSuitableCrops(address, soil);

  return NextResponse.json({
    district: districtFromAddress(address),
    crops,
    cropNames: crops.map((crop) => crop.cropName),
  });
}
