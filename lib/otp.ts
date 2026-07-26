/**
 * OTP helper with three delivery channels:
 *
 *  - `mock`     : demo default — any phone accepts a fixed code (MOCK_OTP_CODE),
 *                 which the UI shows on screen. No external calls.
 *  - `whatsapp` : generate a 6-digit code, hold it in memory briefly, and push it
 *                 over the Twilio WhatsApp sandbox (the farmer must have joined).
 *  - `sns`      : legacy AWS SNS sandbox phone verification.
 *
 * Channel is chosen by OTP_CHANNEL; if unset we fall back to the old OTP_MOCK
 * behaviour (mock unless OTP_MOCK="false").
 */

import {
  sendPhoneVerificationOtp,
  verifyPhoneVerificationOtp,
} from './aws/sns';
import { sendWhatsApp, isTwilioConfigured } from './whatsapp/twilio';
import { toTenDigitPhone, toIndiaPhone } from './phone';

export const MOCK_OTP_CODE = process.env.MOCK_OTP_CODE ?? '123456';

export type OtpChannel = 'mock' | 'whatsapp' | 'sns';

/** Mock is the default; only real SNS when OTP_MOCK is explicitly "false". */
export function isMockOtp(): boolean {
  return process.env.OTP_MOCK !== 'false';
}

export function getOtpChannel(): OtpChannel {
  const c = process.env.OTP_CHANNEL;
  if (c === 'whatsapp' || c === 'sns' || c === 'mock') return c;
  // Back-compat: OTP_MOCK used to toggle mock vs SNS.
  return isMockOtp() ? 'mock' : 'sns';
}

// ---------------------------------------------------------------------------
// In-memory OTP store (WhatsApp channel). Fine for a single instance; codes are
// short-lived, so a process restart in the ~5-min window just asks for a resend.
// ---------------------------------------------------------------------------
const OTP_TTL_MS = 5 * 60 * 1000;
const otpStore = new Map<string, { code: string; expiresAt: number }>();

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function storeCode(phone: string, code: string): void {
  otpStore.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS });
}

function checkCode(phone: string, code: string): boolean {
  const entry = otpStore.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return false;
  }
  return entry.code === code;
}

/** Drop a stored code once it has served its purpose (e.g. after registration). */
export function clearOtp(phoneRaw: string): void {
  otpStore.delete(toTenDigitPhone(phoneRaw));
}

export interface SendOtpResult {
  channel: OtpChannel;
  mock: boolean;
  /** Present only in mock mode so the UI can display the demo code. */
  devCode?: string;
  message: string;
}

export async function sendOtp(phoneRaw: string): Promise<SendOtpResult> {
  const phone = toTenDigitPhone(phoneRaw);
  const channel = getOtpChannel();

  if (channel === 'mock') {
    return {
      channel,
      mock: true,
      devCode: MOCK_OTP_CODE,
      message: `Demo mode — use OTP ${MOCK_OTP_CODE}.`,
    };
  }

  if (channel === 'whatsapp') {
    if (!isTwilioConfigured()) {
      throw new Error('WhatsApp is not configured. Please contact support.');
    }
    const code = generateCode();
    storeCode(phone, code);
    await sendWhatsApp(
      toIndiaPhone(phone),
      `Your FarmAdvisor verification code is ${code}. It expires in 5 minutes — do not share it with anyone.`,
    );
    return { channel, mock: false, message: 'OTP sent to your WhatsApp.' };
  }

  // sns
  await sendPhoneVerificationOtp(phone);
  return { channel, mock: false, message: 'OTP sent to your phone number.' };
}

/** Throws when the OTP is wrong/expired. */
export async function verifyOtp(phoneRaw: string, otp: string): Promise<void> {
  const phone = toTenDigitPhone(phoneRaw);
  const channel = getOtpChannel();

  if (channel === 'mock') {
    if (otp !== MOCK_OTP_CODE) {
      throw new Error(`Incorrect OTP. In demo mode the code is ${MOCK_OTP_CODE}.`);
    }
    return;
  }

  if (channel === 'whatsapp') {
    // Non-consuming: the register flow verifies twice (verify step + register),
    // so we keep the code valid until it expires or registration clears it.
    if (!checkCode(phone, otp)) {
      throw new Error('Incorrect or expired OTP. Please request a new code.');
    }
    return;
  }

  await verifyPhoneVerificationOtp(phone, otp);
}
