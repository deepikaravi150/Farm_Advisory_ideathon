import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPhoneVerificationStatus, normalizePhoneNumber } from '@/lib/aws/sns';

const StatusSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone } = StatusSchema.parse(body);

    const status = await getPhoneVerificationStatus(phone);
    return NextResponse.json({
      success: true,
      phoneNumber: normalizePhoneNumber(phone),
      snsSandboxStatus: status ?? 'NotAdded',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error('OTP status error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Could not check SNS phone status',
    }, { status: 500 });
  }
}
