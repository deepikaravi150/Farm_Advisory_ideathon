import { NextResponse } from 'next/server';
import { getSandboxJoinInfo } from '@/lib/whatsapp/twilio';
import { getOtpChannel } from '@/lib/otp';

// Returns the WhatsApp sandbox join deep link (+ the active OTP channel) so the
// register page knows whether to show the join/QR flow. The link is identical
// for every farmer (no secrets).
export async function GET() {
  return NextResponse.json({ ...getSandboxJoinInfo(), otpChannel: getOtpChannel() });
}
