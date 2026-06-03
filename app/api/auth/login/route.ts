import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { comparePassword, signToken } from '@/lib/auth';
import { findFarmersByPhone } from '@/app/api/auth/farmers';

function requireAwsEnv() {
  const missing = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Create .env.local with the required AWS credentials.`);
  }
}

const LoginSchema = z.object({
  phone: z.string().regex(/^\d{10}$/),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    requireAwsEnv();
    const body = await req.json();
    const { phone, password } = LoginSchema.parse(body);

    // Lookup by phone using shared helper that handles missing phone-index gracefully
    const results = await findFarmersByPhone(phone);

    if (!results.length) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const farmer = results[0];
    const valid = await comparePassword(password, farmer.password_hash as string);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = signToken({
      farmerId: farmer.farmer_id as string,
      phone: farmer.phone as string,
      name: farmer.name as string,
    });

    const response = NextResponse.json({
      success: true,
      farmer: {
        farmerId: farmer.farmer_id,
        name: farmer.name,
        phone: farmer.phone,
        preferredLanguage: farmer.preferred_language ?? 'en',
      },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      // Only set the Secure flag when explicitly serving over HTTPS. Over plain
      // HTTP (e.g. http://<ip>:3000) a Secure cookie is dropped by the browser,
      // which silently breaks login. Set COOKIE_SECURE=true once behind HTTPS.
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('auth_token');
  return response;
}
