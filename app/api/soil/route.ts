import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { queryItems, Tables } from '@/lib/aws/dynamodb';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

/** Latest soil report for the logged-in farmer (the current one if marked). */
export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const reports = await queryItems({
      TableName: Tables.SOIL_REPORTS,
      KeyConditionExpression: 'farmer_id = :fid',
      ExpressionAttributeValues: { ':fid': farmer.farmerId },
      ScanIndexForward: false,
      Limit: 10,
    });

    if (!reports.length) {
      return NextResponse.json({ soil: null }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const item = reports.find((r) => r.is_current) ?? reports[0];

    return NextResponse.json({
      soil: {
        ph: item.ph ?? null,
        electricalConductivity: item.electrical_conductivity ?? null,
        organicCarbon: item.organic_carbon ?? null,
        nitrogen: item.nitrogen ?? null,
        phosphorus: item.phosphorus ?? null,
        potassium: item.potassium ?? null,
        micronutrients: item.micronutrients ?? null,
        plainLanguageSummary: item.plain_language_summary ?? null,
        keyFindings: item.key_findings ?? null,
        recommendations: item.recommendations ?? null,
        labName: item.lab_name ?? null,
        reportDate: item.report_date ?? null,
        locale: item.locale ?? null,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Soil fetch error:', err);
    return NextResponse.json({ soil: null });
  }
}
