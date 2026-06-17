import { NextRequest, NextResponse } from 'next/server';
import { getGovFarmerRecord } from '@/lib/synthetic-gov-data';

/**
 * Simulates fetching a farmer's record from the government registry. Used on the
 * registration confirm screen after OTP verification. Returns only the fields we
 * want to show the farmer (no raw coordinates).
 */
export async function GET(req: NextRequest) {
  const farmerId = req.nextUrl.searchParams.get('farmerId') ?? '';
  const phone = req.nextUrl.searchParams.get('phone') ?? '';

  const record = getGovFarmerRecord(farmerId, phone);
  if (!record) {
    return NextResponse.json(
      { error: 'No government record found for this Farmer ID and phone number.' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    record: {
      farmerId: record.farmer_id,
      name: record.name,
      district: record.district,
      address: record.address,
      landAreaAcres: record.land_area_acres,
      typography: record.typography,
      preferredLanguage: record.preferred_language,
      surveyNumber: record.survey_number,
      aadhaarMasked: record.aadhaar_masked,
      category: record.category,
    },
  });
}
