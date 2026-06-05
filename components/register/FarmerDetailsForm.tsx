'use client';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { User, Phone, CreditCard, Layers, Maximize, MapPin, ShieldCheck } from 'lucide-react';

export interface FarmerFormData {
  farmerId: string;
  name: string;
  phone: string;
  otp: string;
  address: string;
  typography?: string;
  landAreaAcres: number;
}
interface Props { onNext: (data: FarmerFormData) => void; }

export default function FarmerDetailsForm({ onNext }: Props) {
  const t = useTranslations('register');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpStatus, setOtpStatus] = useState('');
  const [otpError, setOtpError] = useState('');

  const schema = useMemo(() => z.object({
    farmerId: z.string().min(1, t('errFarmerId')),
    name: z.string().min(2, t('errName')),
    phone: z.string().regex(/^\d{10}$/, t('errPhone')),
    otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP sent to this phone number'),
    address: z.string().min(3, t('errAddress')),
    typography: z.string().optional(),
    landAreaAcres: z.coerce.number().positive(t('errLandArea')),
  }), [t]);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FarmerFormData>({ resolver: zodResolver(schema) });
  const phone = watch('phone') ?? '';

  async function sendOtp() {
    setSendingOtp(true);
    setOtpStatus('');
    setOtpError('');
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
      setOtpStatus(typeof data.message === 'string' ? data.message : 'OTP sent. Enter it below to verify this phone number.');
    } catch {
      setOtpError('Could not send OTP');
    } finally {
      setSendingOtp(false);
    }
  }

  const fields = [
    { name: 'farmerId' as const, label: t('farmerId'), placeholder: t('farmerIdPlaceholder'), icon: CreditCard },
    { name: 'name' as const, label: t('name'), placeholder: t('namePlaceholder'), icon: User },
    { name: 'address' as const, label: t('address'), placeholder: t('addressPlaceholder'), icon: MapPin, note: t('addressNote') },
    { name: 'typography' as const, label: t('landType'), placeholder: t('landTypePlaceholder'), icon: Layers },
    { name: 'landAreaAcres' as const, label: t('landArea'), placeholder: t('landAreaPlaceholder'), icon: Maximize },
  ];

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4">
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
            <input {...register('phone')} placeholder={t('phonePlaceholder')} inputMode="numeric"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" />
          </div>
          <button type="button" onClick={sendOtp} disabled={sendingOtp || !/^\d{10}$/.test(phone)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-40 text-sm font-semibold">
            <ShieldCheck className="w-4 h-4" />
            {sendingOtp ? 'Sending' : 'Send OTP'}
          </button>
        </div>
        {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
        {otpError && <p className="text-red-500 text-xs mt-1">{otpError}</p>}
        {otpStatus && <p className="text-brand-600 text-xs mt-1">{otpStatus}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone OTP</label>
        <div className="relative">
          <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input {...register('otp')} placeholder="6-digit OTP" inputMode="numeric"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" />
        </div>
        {errors.otp && <p className="text-red-500 text-xs mt-1">{errors.otp.message}</p>}
      </div>
      {fields.slice(2).map(f => (
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
      <button type="submit" className="w-full bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 font-semibold mt-2">
        {t('nextDrawBoundary')}
      </button>
    </form>
  );
}
