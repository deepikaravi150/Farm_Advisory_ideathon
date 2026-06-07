'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { toTenDigitPhone } from '@/lib/phone';

export default function VerifyOtpPage() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function sendOtp() {
    setLoading(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not send OTP');
        return;
      }
      setStatus('OTP sent to this number.');
    } catch {
      setError('Could not send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not verify OTP');
        return;
      }
      setStatus(data.farmerUpdated ? 'Phone verified in SNS and farmer profile.' : 'Phone verified in SNS.');
    } catch {
      setError('Could not verify OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-earth-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <ShieldCheck className="w-7 h-7 text-brand-600" />
          <span className="text-xl font-bold text-brand-700">Verify phone OTP</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">+91</span>
              <input
                value={phone}
                onChange={(event) => setPhone(toTenDigitPhone(event.target.value))}
                placeholder="10-digit phone number"
                inputMode="numeric"
                className="w-full border border-gray-300 rounded-xl pl-14 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">OTP</label>
            <input
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit OTP"
              inputMode="numeric"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          {status && <p className="text-brand-600 text-sm">{status}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={sendOtp}
              disabled={loading || phone.length !== 10}
              className="flex-1 border border-brand-200 text-brand-700 py-3 rounded-xl hover:bg-brand-50 disabled:opacity-40 font-semibold"
            >
              Send OTP
            </button>
            <button
              type="button"
              onClick={verifyOtp}
              disabled={loading || phone.length !== 10 || otp.length !== 6}
              className="flex-1 bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 disabled:opacity-40 font-semibold"
            >
              Verify
            </button>
          </div>
        </div>

        <p className="text-sm text-center text-gray-500 mt-6">
          <Link href="/register" className="text-brand-600 hover:text-brand-800 font-medium">Back to register</Link>
        </p>
      </div>
    </div>
  );
}
