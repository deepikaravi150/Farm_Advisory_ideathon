'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Sprout, Phone, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { toTenDigitPhone } from '@/lib/phone';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const notice = searchParams.get('notice') === 'exists'
    ? 'This Farmer ID is already registered. Please login with your phone number.'
    : '';

  const phoneValid = /^\d{10}$/.test(phone);
  const otpValid = /^\d{6}$/.test(otp);

  async function sendOtp() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not send OTP'); return; }
      setOtpSent(true);
      setDevCode(typeof data.devCode === 'string' ? data.devCode : '');
    } catch { setError('Could not send OTP'); }
    finally { setBusy(false); }
  }

  async function login() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, locale }),
      });
      const data = await res.json();
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Login failed'); return; }
      router.push('/today');
      router.refresh();
    } catch { setError('Network error. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-brand-50 to-earth-50">
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-5 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sprout className="h-7 w-7 text-brand-600" />
            <span className="text-xl font-bold text-brand-700">FarmAdvisor</span>
          </div>
          <LanguageSwitcher />
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Login with your phone number and OTP.</p>

          {notice && !error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
              <AlertCircle className="h-4 w-4 shrink-0" />{notice}
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          <label className="mt-5 block text-sm font-medium text-gray-700">Phone number</label>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-gray-500">+91</span>
              <input
                value={phone}
                inputMode="numeric"
                onChange={(e) => { setPhone(toTenDigitPhone(e.target.value)); setOtpSent(false); }}
                placeholder="10-digit mobile"
                className="w-full rounded-xl border border-gray-300 py-3 pl-[4.5rem] pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <button
              type="button"
              onClick={sendOtp}
              disabled={busy || !phoneValid}
              className="shrink-0 rounded-xl border border-brand-300 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
            >
              {otpSent ? 'Resend' : 'Send OTP'}
            </button>
          </div>

          {otpSent && (
            <>
              {devCode && (
                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Demo mode — your OTP is <span className="font-bold">{devCode}</span>
                </div>
              )}
              <label className="mt-4 block text-sm font-medium text-gray-700">Enter OTP</label>
              <div className="relative mt-1">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={otp}
                  inputMode="numeric"
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit OTP"
                  className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={login}
            disabled={busy || !otpSent || !otpValid}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Login
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          New farmer?{' '}
          <Link href="/register" className="font-medium text-brand-600 hover:text-brand-800">Register here</Link>
        </p>
      </div>
    </div>
  );
}
