import { NextRequest, NextResponse } from 'next/server';
import { getGovFarmerRecord } from '@/lib/synthetic-gov-data';
import { getItem, Tables } from '@/lib/aws/dynamodb';
import { toTenDigitPhone } from '@/lib/phone';

const NOT_FOUND = 'No government record found for this Farmer ID and phone number.';

/**
 * Fetch a farmer's record for the registration confirm screen (after OTP).
 *
 * Looks in two places, in order:
 *   1. the synthetic government registry — pre-fills a *brand-new* farmer's
 *      profile from an external identity source, and
 *   2. our own database — a farmer who already exists here (seeded, or registered
 *      earlier) but isn't in the synthetic registry can still onboard.
 *
 * For the DB fallback the OTP-verified phone must match the stored phone, so
 * nobody can pull another farmer's details with just an ID. Returns only the
 * fields we show the farmer (no raw coordinates).
 */
export async function GET(req: NextRequest) {
  const farmerId = (req.nextUrl.searchParams.get('farmerId') ?? '').trim().toUpperCase();
  const phone = toTenDigitPhone(req.nextUrl.searchParams.get('phone') ?? '');

  // 1. Synthetic government registry.
  const gov = getGovFarmerRecord(farmerId, phone);
  if (gov) {
    return NextResponse.json({
      source: 'gov',
      record: {
        farmerId: gov.farmer_id,
        name: gov.name,
        district: gov.district,
        address: gov.address,
        landAreaAcres: gov.land_area_acres,
        typography: gov.typography,
        preferredLanguage: gov.preferred_language,
        surveyNumber: gov.survey_number,
        aadhaarMasked: gov.aadhaar_masked,
        category: gov.category,
      },
    });
  }

  // 2. Fall back to an existing farmer in our database (phone must match).
  try {
    const existing = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmerId });
    if (existing && toTenDigitPhone(String(existing.phone ?? '')) === phone) {
      const lang = String(existing.preferred_language ?? 'en');
      return NextResponse.json({
        source: 'existing',
        alreadyRegistered: true,
        record: {
          farmerId: String(existing.farmer_id),
          name: String(existing.name ?? 'Farmer'),
          district: String(existing.district ?? ''),
          address: String(existing.address ?? ''),
          landAreaAcres: Number(existing.land_area_acres ?? 0) || 0,
          typography: String(existing.typography ?? ''),
          preferredLanguage: (['en', 'hi', 'ta'].includes(lang) ? lang : 'en') as 'en' | 'hi' | 'ta',
          surveyNumber: String(existing.survey_number ?? ''),
          aadhaarMasked: String(existing.aadhaar_masked ?? ''),
          category: String(existing.category ?? ''),
        },
      });
    }
  } catch (e) {
    console.error('gov-lookup DB fallback failed:', e);
  }

  return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
}
