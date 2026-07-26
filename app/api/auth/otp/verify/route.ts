import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyOtp } from '@/lib/otp';
import { toTenDigitPhone } from '@/lib/phone';

const VerifyOtpSchema = z.object({
  phone: z.preprocess((value) => toTenDigitPhone(String(value ?? '')), z.string().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number')),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
});

export async function POST(req: NextRequest) {
  try {
    const { phone, otp } = VerifyOtpSchema.parse(await req.json());
    await verifyOtp(phone, otp);
    return NextResponse.json({ success: true, message: 'Phone number verified.' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'OTP verification failed';
    console.error('Verify OTP error:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
