'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Sprout, CreditCard, Phone, ShieldCheck, CheckCircle2, MapPin, Maximize, Languages, Landmark, Loader2, MessageCircle } from 'lucide-react';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { toTenDigitPhone } from '@/lib/phone';

interface GovRecord {
  farmerId: string;
  name: string;
  district: string;
  address: string;
  landAreaAcres: number;
  typography: string;
  preferredLanguage: 'en' | 'hi' | 'ta';
  surveyNumber: string;
  aadhaarMasked: string;
  category: string;
}

interface JoinInfo {
  link: string;
  keyword: string;
  otpChannel: 'mock' | 'whatsapp' | 'sns';
}

const LANG_LABEL: Record<string, string> = { en: 'English', ta: 'தமிழ்', hi: 'हिन्दी' };

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'verify' | 'confirm'>('verify');

  const [farmerId, setFarmerId] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [sentNote, setSentNote] = useState('');
  const [record, setRecord] = useState<GovRecord | null>(null);

  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [qr, setQr] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const idValid = /^TN\d{11}$/.test(farmerId.trim().toUpperCase());
  const phoneValid = /^\d{10}$/.test(phone);
  const otpValid = /^\d{6}$/.test(otp);

  // Decide whether to show the WhatsApp join flow, and prep the QR for desktop.
  useEffect(() => {
    fetch('/api/auth/whatsapp-join')
      .then((r) => r.json())
      .then((d: Partial<JoinInfo>) => {
        const info: JoinInfo = {
          link: d.link ?? '',
          keyword: d.keyword ?? '',
          otpChannel: (d.otpChannel as JoinInfo['otpChannel']) ?? 'mock',
        };
        setJoin(info);
        if (info.link) {
          QRCode.toDataURL(info.link, { width: 200, margin: 1 }).then(setQr).catch(() => {});
        }
      })
      .catch(() => setJoin({ link: '', keyword: '', otpChannel: 'mock' }));
  }, []);

  const useWhatsAppJoin = Boolean(join && join.otpChannel === 'whatsapp' && join.link);

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
      setSentNote(data.channel === 'whatsapp' ? 'We sent your 6-digit code on WhatsApp. Enter it below.' : '');
    } catch { setError('Could not send OTP'); }
    finally { setBusy(false); }
  }

  async function verifyAndFetch() {
    setError('');
    setBusy(true);
    try {
      const verifyRes = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) { setError(typeof verifyData.error === 'string' ? verifyData.error : 'Incorrect OTP'); return; }

      const lookupRes = await fetch(`/api/auth/gov-lookup?farmerId=${encodeURIComponent(farmerId.trim().toUpperCase())}&phone=${encodeURIComponent(phone)}`);
      const lookupData = await lookupRes.json();
      if (!lookupRes.ok) {
        // No matching Farmer ID anywhere (gov registry or our DB) — nothing to
        // register, so send them to login instead of showing a dead-end error.
        router.push('/login');
        return;
      }
      if (lookupData.alreadyRegistered) {
        router.push('/login?notice=exists');
        return;
      }
      setRecord(lookupData.record as GovRecord);
      setStep('confirm');
    } catch { setError('Verification failed. Please try again.'); }
    finally { setBusy(false); }
  }

  async function confirmAndCreate() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId: farmerId.trim().toUpperCase(), phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Registration failed'); return; }
      router.push('/today');
      router.refresh();
    } catch { setError('Registration failed. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-brand-50 to-earth-50">
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sprout className="h-7 w-7 text-brand-600" />
            <span className="text-xl font-bold text-brand-700">FarmAdvisor</span>
          </div>
          <LanguageSwitcher />
        </div>

        {step === 'verify' && (
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h1 className="text-lg font-bold text-gray-900">Sign up with your Farmer ID</h1>
            <p className="mt-1 text-sm text-gray-500">We&apos;ll fetch your details from government records — no long forms.</p>

            <label className="mt-5 block text-sm font-medium text-gray-700">Government Farmer ID</label>
            <div className="relative mt-1">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={farmerId}
                onChange={(e) => setFarmerId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13))}
                placeholder="TN10000000001"
                className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>

            <label className="mt-4 block text-sm font-medium text-gray-700">Phone number</label>
            <div className="relative mt-1">
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

            {idValid && phoneValid && join && (
              useWhatsAppJoin ? (
                <div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
                  <div className="flex items-center gap-2 text-brand-700">
                    <MessageCircle className="h-5 w-5" />
                    <span className="text-sm font-semibold">Verify on WhatsApp</span>
                  </div>

                  <div className="mt-3 text-sm text-gray-600">
                    <p><span className="font-semibold text-gray-800">1.</span> Open WhatsApp and send the ready-made message to join FarmAdvisor.</p>
                    <a
                      href={join.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-2.5 font-semibold text-white hover:brightness-95"
                    >
                      <MessageCircle className="h-4 w-4" /> Open WhatsApp to join
                    </a>
                    {join.keyword && (
                      <p className="mt-1 text-center text-xs text-gray-400">Sends &ldquo;join {join.keyword}&rdquo;</p>
                    )}
                    {qr && (
                      <div className="mt-3 flex flex-col items-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qr} alt="Scan to join FarmAdvisor on WhatsApp" className="h-36 w-36 rounded-lg border border-gray-200 bg-white p-1" />
                        <p className="mt-1 text-xs text-gray-400">On a computer? Scan with your phone.</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 text-sm text-gray-600">
                    <p><span className="font-semibold text-gray-800">2.</span> Joined? Get your verification code:</p>
                    <button
                      type="button"
                      onClick={sendOtp}
                      disabled={busy}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-300 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {otpSent ? 'Resend OTP on WhatsApp' : 'Send my OTP'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={busy}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-300 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {otpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
              )
            )}

            {otpSent && (
              <>
                {devCode && (
                  <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Demo mode — your OTP is <span className="font-bold">{devCode}</span>
                  </div>
                )}
                {sentNote && (
                  <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{sentNote}</div>
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

            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

            <button
              type="button"
              onClick={verifyAndFetch}
              disabled={busy || !otpSent || !otpValid}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Verify &amp; Fetch My Details
            </button>

            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-gray-500">
              Demo accounts: <span className="font-medium text-gray-700">TN10000000001 / 9876500001</span> ·
              <span className="font-medium text-gray-700"> TN10000000004 / 9876500004</span>
            </p>
          </div>
        )}

        {step === 'confirm' && record && (
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-brand-700">
              <Landmark className="h-5 w-5" />
              <h1 className="text-lg font-bold">Confirm your details</h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">Fetched from government records. Confirm to continue.</p>

            <div className="mt-4 space-y-3">
              <Detail icon={<CheckCircle2 className="h-4 w-4 text-brand-600" />} label="Name" value={record.name} />
              <Detail icon={<MapPin className="h-4 w-4 text-brand-600" />} label="Location" value={record.address} />
              <Detail icon={<Maximize className="h-4 w-4 text-brand-600" />} label="Land" value={`${record.landAreaAcres} acres · ${record.typography}`} />
              <Detail icon={<Languages className="h-4 w-4 text-brand-600" />} label="Language" value={LANG_LABEL[record.preferredLanguage] ?? record.preferredLanguage} />
              <Detail icon={<CreditCard className="h-4 w-4 text-brand-600" />} label="Survey / Aadhaar" value={`Survey ${record.surveyNumber} · ${record.aadhaarMasked}`} />
              <Detail icon={<Landmark className="h-4 w-4 text-brand-600" />} label="Category" value={record.category} />
            </div>

            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

            <button
              type="button"
              onClick={confirmAndCreate}
              disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm &amp; Continue
            </button>
            <button
              type="button"
              onClick={() => { setStep('verify'); setError(''); }}
              className="mt-2 w-full rounded-xl border border-gray-300 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Already registered?{' '}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-800">Login</Link>
        </p>
      </div>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value}</p>
      </div>
    </div>
  );
}
