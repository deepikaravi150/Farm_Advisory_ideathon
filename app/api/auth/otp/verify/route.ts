import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyPhoneVerificationOtp } from '@/lib/aws/sns';
import { findFarmersByPhone } from '@/app/api/auth/farmers';
import { toTenDigitPhone } from '@/lib/phone';
import { updateItem, Tables } from '@/lib/aws/dynamodb';

const VerifyOtpSchema = z.object({
  phone: z.preprocess((value) => toTenDigitPhone(String(value ?? '')), z.string().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number')),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, otp } = VerifyOtpSchema.parse(body);

    await verifyPhoneVerificationOtp(phone, otp);

    const farmers = await findFarmersByPhone(phone);
    const farmer = farmers[0];
    if (typeof farmer?.farmer_id === 'string') {
      await updateItem({
        TableName: Tables.FARMER_PROFILES,
        Key: { farmer_id: farmer.farmer_id },
        UpdateExpression: 'SET phone_verified = :verified, phone_verified_at = :verifiedAt',
        ExpressionAttributeValues: {
          ':verified': true,
          ':verifiedAt': new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({ success: true, farmerUpdated: Boolean(farmer) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error('Verify OTP error:', err);
    return NextResponse.json({ error: 'OTP verification failed' }, { status: 500 });
  }
}
