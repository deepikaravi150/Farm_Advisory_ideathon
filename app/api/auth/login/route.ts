import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { comparePassword, signToken } from '@/lib/auth';
import { findFarmersByPhone } from '../farmers';

const LoginSchema = z.object({
  phone: z.string().regex(/^\d{10}$/),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, password } = LoginSchema.parse(body);

    const results = await findFarmersByPhone(phone);

    if (!results.length) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    let farmer = null;
    for (const result of results) {
      const passwordHash = result.password_hash;
      if (typeof passwordHash !== 'string') continue;
      const valid = await comparePassword(password, passwordHash);
      if (valid) {
        farmer = result;
        break;
      }
    }

    if (!farmer) {
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
    const msg = err instanceof Error ? err.message : String(err);
    const body = process.env.NODE_ENV === 'production' ? { error: 'Login failed' } : { error: 'Login failed', details: msg };
    return NextResponse.json(body, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('auth_token');
  return response;
}
