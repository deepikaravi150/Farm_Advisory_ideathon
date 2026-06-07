'use client';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { User, Phone, CreditCard, Layers, Maximize, MapPin, ShieldCheck, Languages } from 'lucide-react';
import { toTenDigitPhone } from '@/lib/phone';

export interface FarmerFormData {
  farmerId: string;
  name: string;
  phone: string;
  otp: string;
  address: string;
  typography?: string;
  landAreaAcres: number;
  preferredLanguage: 'en' | 'hi' | 'ta';
}
interface Props { onNext: (data: FarmerFormData) => void; }

export default function FarmerDetailsForm({ onNext }: Props) {
  const t = useTranslations('register');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpStatus, setOtpStatus] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  const schema = useMemo(() => z.object({
    farmerId: z.string()
      .transform((value) => value.trim().toUpperCase())
      .pipe(z.string().regex(/^TN\d{11}$/, 'Farmer ID must be TN followed by 11 digits')),
    name: z.string().min(2, t('errName')),
    phone: z.string().regex(/^\d{10}$/, t('errPhone')),
    otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP sent to this phone number'),
    address: z.string().min(3, t('errAddress')),
    typography: z.string().optional(),
    landAreaAcres: z.coerce.number().positive(t('errLandArea')),
    preferredLanguage: z.enum(['en', 'hi', 'ta']),
  }), [t]);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FarmerFormData>({
    resolver: zodResolver(schema),
    defaultValues: { preferredLanguage: 'en' },
  });
  const phone = watch('phone') ?? '';
  const otp = watch('otp') ?? '';
  const farmerIdField = register('farmerId', { setValueAs: (value) => String(value ?? '').trim().toUpperCase() });
  const phoneField = register('phone', { setValueAs: toTenDigitPhone });

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const resendLabel = `${Math.floor(resendSeconds / 60)}:${String(resendSeconds % 60).padStart(2, '0')}`;

  async function sendOtp() {
    setSendingOtp(true);
    setOtpStatus('');
    setOtpError('');
    setOtpVerified(false);
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(typeof data.error === 'string' ? data.error : 'Could not send OTP');
        return;
      }
      setOtpSent(true);
      setResendSeconds(300);
      setOtpStatus(typeof data.message === 'string' ? data.message : 'OTP sent. Enter it below to verify this phone number.');
    } catch {
      setOtpError('Could not send OTP');
    } finally {
      setSendingOtp(false);
    }
  }

  async function verifyOtp() {
    if (!/^\d{10}$/.test(phone) || !/^\d{6}$/.test(otp)) {
      setOtpError('Enter the phone number and 6-digit OTP first');
      setOtpStatus('');
      return;
    }
    setVerifyingOtp(true);
    setOtpStatus('');
    setOtpError('');
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpVerified(false);
        setOtpError(typeof data.error === 'string' ? data.error : 'Could not verify OTP');
        return;
      }
      setOtpVerified(true);
      setOtpStatus(typeof data.message === 'string' ? data.message : 'Phone number verified successfully.');
    } catch {
      setOtpVerified(false);
      setOtpError('Could not verify OTP');
    } finally {
      setVerifyingOtp(false);
    }
  }

  function submitDetails(data: FarmerFormData) {
    if (!otpVerified) {
      setOtpError('Please verify the OTP before continuing');
      setOtpStatus('');
      return;
    }
    onNext(data);
  }

  const fields = [
    { name: 'farmerId' as const, label: t('farmerId'), placeholder: 'TN12345678901', icon: CreditCard },
    { name: 'name' as const, label: t('name'), placeholder: t('namePlaceholder'), icon: User },
    { name: 'address' as const, label: t('address'), placeholder: t('addressPlaceholder'), icon: MapPin, note: t('addressNote') },
    { name: 'typography' as const, label: t('landType'), placeholder: t('landTypePlaceholder'), icon: Layers },
    { name: 'landAreaAcres' as const, label: t('landArea'), placeholder: t('landAreaPlaceholder'), icon: Maximize },
  ];

  return (
    <form onSubmit={handleSubmit(submitDetails)} className="space-y-4">
      {fields.slice(0, 2).map(f => (
        <div key={f.name}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
          <div className="relative">
            <f.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input {...register(f.name)} placeholder={f.placeholder}
              type={f.name === 'landAreaAcres' ? 'number' : 'text'}
              step={f.name === 'landAreaAcres' ? '0.1' : undefined}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" />
          </div>
          {errors[f.name] && <p className="text-red-500 text-xs mt-1">{errors[f.name]?.message}</p>}
          {'note' in f && f.note && !errors[f.name] && <p className="text-gray-400 text-xs mt-1">{f.note}</p>}
        </div>
      ))}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')}</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <div className="absolute left-10 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">+91</div>
            <input {...phoneField} placeholder={t('phonePlaceholder')} inputMode="numeric"
              onChange={(e) => {
                e.currentTarget.value = toTenDigitPhone(e.currentTarget.value);
                setOtpVerified(false);
                phoneField.onChange(e);
              }}
              className="w-full pl-20 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" />
          </div>
          <button type="button" onClick={sendOtp} disabled={sendingOtp || resendSeconds > 0 || !/^\d{10}$/.test(phone)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-40 text-sm font-semibold">
            <ShieldCheck className="w-4 h-4" />
            {sendingOtp ? 'Sending' : otpSent ? (resendSeconds > 0 ? `Resend OTP ${resendLabel}` : 'Resend OTP') : 'Send OTP'}
          </button>
        </div>
        {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
        {otpError && <p className="text-red-500 text-xs mt-1">{otpError}</p>}
        {otpStatus && <p className="text-brand-600 text-xs mt-1">{otpStatus}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone OTP</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input {...register('otp', {
              onChange: () => setOtpVerified(false),
            })} placeholder="6-digit OTP" inputMode="numeric"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" />
          </div>
          <button type="button" onClick={verifyOtp} disabled={verifyingOtp || otpVerified || !/^\d{10}$/.test(phone) || !/^\d{6}$/.test(otp)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-40 text-sm font-semibold">
            <ShieldCheck className="w-4 h-4" />
            {verifyingOtp ? 'Verifying' : otpVerified ? 'Verified' : 'Verify OTP'}
          </button>
        </div>
        {errors.otp && <p className="text-red-500 text-xs mt-1">{errors.otp.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">SMS Language</label>
        <div className="relative">
          <Languages className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select {...register('preferredLanguage')}
            className="w-full appearance-none pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm">
            <option value="en">English</option>
            <option value="ta">தமிழ்</option>
            <option value="hi">हिन्दी</option>
          </select>
        </div>
        <p className="text-gray-400 text-xs mt-1">Daily SMS suggestions will be sent in this language.</p>
      </div>
      {fields.slice(2).map(f => (
        <div key={f.name}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
          <div className="relative">
            <f.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input {...(f.name === 'farmerId' ? farmerIdField : register(f.name))} placeholder={f.placeholder}
              type={f.name === 'landAreaAcres' ? 'number' : 'text'}
              step={f.name === 'landAreaAcres' ? '0.1' : undefined}
              maxLength={f.name === 'farmerId' ? 13 : undefined}
              onChange={f.name === 'farmerId' ? (e) => {
                e.currentTarget.value = e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13);
                farmerIdField.onChange(e);
              } : undefined}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" />
          </div>
          {errors[f.name] && <p className="text-red-500 text-xs mt-1">{errors[f.name]?.message}</p>}
          {'note' in f && f.note && !errors[f.name] && <p className="text-gray-400 text-xs mt-1">{f.note}</p>}
        </div>
      ))}
      <button type="submit" className="w-full bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 font-semibold mt-2">
        {t('nextDrawBoundary')}
      </button>
    </form>
  );
}
