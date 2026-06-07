import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPhoneVerificationStatus, normalizePhoneNumber, sendPhoneVerificationOtp } from '@/lib/aws/sns';
import { toTenDigitPhone } from '@/lib/phone';

const SendOtpSchema = z.object({
  phone: z.preprocess((value) => toTenDigitPhone(String(value ?? '')), z.string().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number')),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone } = SendOtpSchema.parse(body);

    await sendPhoneVerificationOtp(phone);
    const status = await getPhoneVerificationStatus(phone);

    return NextResponse.json({
      success: true,
      phoneNumber: normalizePhoneNumber(phone),
      snsSandboxStatus: status,
      message: status === 'Verified'
        ? 'Phone number is already verified in AWS SNS.'
        : 'AWS SNS verification OTP sent to this phone number.',
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
