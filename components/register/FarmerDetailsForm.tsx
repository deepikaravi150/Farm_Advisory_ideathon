'use client';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { User, Phone, CreditCard, Layers, Maximize, MapPin } from 'lucide-react';

export interface FarmerFormData {
  farmerId: string;
  name: string;
  phone: string;
  address: string;
  typography?: string;
  landAreaAcres: number;
}
interface Props { onNext: (data: FarmerFormData) => void; }

export default function FarmerDetailsForm({ onNext }: Props) {
  const t = useTranslations('register');

  const schema = useMemo(() => z.object({
    farmerId: z.string().min(1, t('errFarmerId')),
    name: z.string().min(2, t('errName')),
    phone: z.string().regex(/^\d{10}$/, t('errPhone')),
    address: z.string().min(3, t('errAddress')),
    typography: z.string().optional(),
    landAreaAcres: z.coerce.number().positive(t('errLandArea')),
  }), [t]);

  const { register, handleSubmit, formState: { errors } } = useForm<FarmerFormData>({ resolver: zodResolver(schema) });

  const fields = [
    { name: 'farmerId' as const, label: t('farmerId'), placeholder: t('farmerIdPlaceholder'), icon: CreditCard },
    { name: 'name' as const, label: t('name'), placeholder: t('namePlaceholder'), icon: User },
    { name: 'phone' as const, label: t('phone'), placeholder: t('phonePlaceholder'), icon: Phone },
    { name: 'address' as const, label: t('address'), placeholder: t('addressPlaceholder'), icon: MapPin, note: t('addressNote') },
    { name: 'typography' as const, label: t('landType'), placeholder: t('landTypePlaceholder'), icon: Layers },
    { name: 'landAreaAcres' as const, label: t('landArea'), placeholder: t('landAreaPlaceholder'), icon: Maximize },
  ];

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4">
      {fields.map(f => (
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
