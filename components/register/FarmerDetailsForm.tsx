'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Phone, CreditCard, Layers, Maximize } from 'lucide-react';

const schema = z.object({
  farmerId: z.string().min(1, 'Farmer ID is required'),
  name: z.string().min(2, 'Full name required'),
  phone: z.string().regex(/^\d{10}$/, 'Enter 10-digit phone number'),
  typography: z.string().optional(),
  landAreaAcres: z.coerce.number().positive('Enter valid land area'),
});

export type FarmerFormData = z.infer<typeof schema>;
interface Props { onNext: (data: FarmerFormData) => void; }

export default function FarmerDetailsForm({ onNext }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FarmerFormData>({ resolver: zodResolver(schema) });

  const fields = [
    { name: 'farmerId' as const, label: 'Government Farmer ID', placeholder: 'e.g. TN-1234567', icon: CreditCard },
    { name: 'name' as const, label: 'Full Name', placeholder: 'Your full name', icon: User },
    { name: 'phone' as const, label: 'Phone Number', placeholder: '10-digit mobile number', icon: Phone },
    { name: 'typography' as const, label: 'Land Type (optional)', placeholder: 'e.g. Clay, Red Soil, Wetland', icon: Layers },
    { name: 'landAreaAcres' as const, label: 'Land Area (acres)', placeholder: 'e.g. 2.5', icon: Maximize },
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
        </div>
      ))}
      <button type="submit" className="w-full bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 font-semibold mt-2">
        Next: Draw Land Boundary →
      </button>
    </form>
  );
}
