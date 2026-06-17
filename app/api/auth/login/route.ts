import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { signToken } from '@/lib/auth';
import { verifyOtp } from '@/lib/otp';
import { findFarmersByPhone } from '@/app/api/auth/farmers';
import { updateItem, Tables } from '@/lib/aws/dynamodb';
import { toTenDigitPhone } from '@/lib/phone';

function requireAwsEnv() {
  const missing = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Create .env.local with the required AWS credentials.`);
  }
}

const LoginSchema = z.object({
  phone: z.preprocess((value) => toTenDigitPhone(String(value ?? '')), z.string().regex(/^\d{10}$/)),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
  locale: z.enum(['en', 'hi', 'ta']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    requireAwsEnv();
    const { phone, otp, locale } = LoginSchema.parse(await req.json());

    await verifyOtp(phone, otp);

    const results = await findFarmersByPhone(phone);
    if (!results.length) {
      return NextResponse.json(
        { error: 'No account found for this phone number. Please register first.' },
        { status: 404 },
      );
    }

    const farmer = results[0];
    const token = signToken({
      farmerId: farmer.farmer_id as string,
      phone: farmer.phone as string,
      name: farmer.name as string,
    });
    const selectedLocale = locale ?? (farmer.preferred_language as string | undefined) ?? 'en';

    if (locale && locale !== farmer.preferred_language) {
      await updateItem({
        TableName: Tables.FARMER_PROFILES,
        Key: { farmer_id: farmer.farmer_id },
        UpdateExpression: 'SET preferred_language = :locale',
        ExpressionAttributeValues: { ':locale': locale },
      });
    }

    const response = NextResponse.json({
      success: true,
      farmer: {
        farmerId: farmer.farmer_id,
        name: farmer.name,
        phone: farmer.phone,
        preferredLanguage: selectedLocale,
      },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      // Only set Secure over HTTPS; on plain http://<ip>:3000 a Secure cookie is
      // dropped, silently breaking login. Set COOKIE_SECURE=true behind HTTPS.
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    response.cookies.set('locale', selectedLocale, {
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });

    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Login failed';
    console.error('Login error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('auth_token');
  return response;
}
