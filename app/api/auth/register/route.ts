import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { putItem, getItem, Tables } from '@/lib/aws/dynamodb';
import { signToken, type JWTPayload } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import { verifyOtp, clearOtp } from '@/lib/otp';
import { getGovFarmerRecord } from '@/lib/synthetic-gov-data';
import { toTenDigitPhone } from '@/lib/phone';
import { mirrorProfileToS3, tryMirror } from '@/lib/farmer-s3-store';

function requireAwsEnv() {
  const missing = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Create .env.local with the required AWS credentials.`);
  }
}

const RegisterSchema = z.object({
  farmerId: z.string()
    .transform((value) => value.trim().toUpperCase())
    .pipe(z.string().regex(/^TN\d{11}$/, 'Farmer ID must be TN followed by 11 digits')),
  phone: z.preprocess((value) => toTenDigitPhone(String(value ?? '')), z.string().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number')),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
});

/** Build the auth cookie + locale cookie on a JSON response. */
function withSession(payload: JWTPayload, locale: string, body: Record<string, unknown>) {
  const response = NextResponse.json(body);
  response.cookies.set('auth_token', signToken(payload), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  response.cookies.set('locale', locale, {
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  return response;
}

export async function POST(req: NextRequest) {
  try {
    requireAwsEnv();
    const { farmerId, phone, otp } = RegisterSchema.parse(await req.json());

    await verifyOtp(phone, otp);
    // OTP did its job; drop any stored WhatsApp code so it can't be reused.
    clearOtp(phone);

    // Already in our database? (Seeded, or registered earlier — possibly not in
    // the synthetic registry.) Log them in instead of failing. The OTP proved they
    // own this phone; require it to match the stored profile so no one can claim
    // another farmer's ID.
    const existing = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmerId });
    if (existing) {
      if (toTenDigitPhone(String(existing.phone ?? '')) !== phone) {
        return NextResponse.json(
          { error: 'This Farmer ID is registered to a different phone number.' },
          { status: 403 },
        );
      }
      const lang = typeof existing.preferred_language === 'string' ? existing.preferred_language : 'en';
      return withSession(
        { farmerId, phone: String(existing.phone), name: String(existing.name ?? 'Farmer') },
        lang,
        { success: true, alreadyRegistered: true, farmerId },
      );
    }

    // Brand-new farmer — pull their details from the (synthetic) government registry.
    const gov = getGovFarmerRecord(farmerId, phone);
    if (!gov) {
      return NextResponse.json(
        { error: 'No government record found for this Farmer ID and phone number.' },
        { status: 404 },
      );
    }

    const profileItem = {
      farmer_id: gov.farmer_id,
      unique_id: generateId(),
      phone: gov.phone,
      name: gov.name,
      address: gov.address,
      district: gov.district,
      land_coordinates: gov.land_coordinates,
      typography: gov.typography,
      land_area_acres: gov.land_area_acres,
      land_picture_s3_key: '',
      // Land-holding category from the registry (e.g. "Small / Marginal farmer").
      // Social community / gender / age / income stay blank until the farmer
      // optionally fills them in, sharpening government-scheme eligibility matching.
      category: gov.category,
      phone_verified: true,
      phone_verified_at: new Date().toISOString(),
      preferred_language: gov.preferred_language,
      source: 'gov_registry_synthetic',
      survey_number: gov.survey_number,
      created_at: new Date().toISOString(),
    };

    await putItem(Tables.FARMER_PROFILES, profileItem);
    await tryMirror('farmer profile register', () => mirrorProfileToS3(profileItem));

    return withSession(
      { farmerId: gov.farmer_id, phone: gov.phone, name: gov.name },
      gov.preferred_language,
      { success: true, farmerId: gov.farmer_id },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Registration failed';
    console.error('Register error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
