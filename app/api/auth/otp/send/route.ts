import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendOtp } from '@/lib/otp';
import { toTenDigitPhone } from '@/lib/phone';

const SendOtpSchema = z.object({
  phone: z.preprocess((value) => toTenDigitPhone(String(value ?? '')), z.string().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number')),
});

export async function POST(req: NextRequest) {
  try {
    const { phone } = SendOtpSchema.parse(await req.json());
    const result = await sendOtp(phone);

    return NextResponse.json({
      success: true,
      mock: result.mock,
      channel: result.channel,
      // devCode is only present in demo/mock mode so the UI can show the code.
      devCode: result.devCode,
      message: result.message,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error('Send OTP error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'OTP sending failed',
    }, { status: 500 });
  }
}
