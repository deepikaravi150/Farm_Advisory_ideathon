/**
 * OTP helper with a demo "mock" mode.
 *
 * For the hackathon/demo build we do not want to depend on AWS SNS sandbox
 * verification or send real SMS. When OTP_MOCK is on (the default), any phone
 * accepts a single fixed code (MOCK_OTP_CODE, default "123456"), which the UI
 * shows on screen. Set OTP_MOCK=false to fall back to the real SNS flow in
 * lib/aws/sns.ts.
 */

import {
  sendPhoneVerificationOtp,
  verifyPhoneVerificationOtp,
} from './aws/sns';
import { toTenDigitPhone } from './phone';

export const MOCK_OTP_CODE = process.env.MOCK_OTP_CODE ?? '123456';

/** Mock is the default; only real SNS when OTP_MOCK is explicitly "false". */
export function isMockOtp(): boolean {
  return process.env.OTP_MOCK !== 'false';
}

export interface SendOtpResult {
  mock: boolean;
  /** Present only in mock mode so the UI can display the demo code. */
  devCode?: string;
  message: string;
}

export async function sendOtp(phoneRaw: string): Promise<SendOtpResult> {
  const phone = toTenDigitPhone(phoneRaw);
  if (isMockOtp()) {
    return {
      mock: true,
      devCode: MOCK_OTP_CODE,
      message: `Demo mode — use OTP ${MOCK_OTP_CODE}.`,
    };
  }
  await sendPhoneVerificationOtp(phone);
  return { mock: false, message: 'OTP sent to your phone number.' };
}

/** Throws when the OTP is wrong (mirrors verifyPhoneVerificationOtp behavior). */
export async function verifyOtp(phoneRaw: string, otp: string): Promise<void> {
  const phone = toTenDigitPhone(phoneRaw);
  if (isMockOtp()) {
    if (otp !== MOCK_OTP_CODE) {
      throw new Error(`Incorrect OTP. In demo mode the code is ${MOCK_OTP_CODE}.`);
    }
    return;
  }
  await verifyPhoneVerificationOtp(phone, otp);
}
