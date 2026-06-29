'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { User, Phone, MapPin, Layers, Edit2, Save, X, Users, IndianRupee, Calendar, UserCircle2 } from 'lucide-react';
import { toIndiaPhone } from '@/lib/phone';

interface Profile {
  farmer_id: string;
  name: string;
  phone: string;
  address?: string;
  land_area_acres: number;
  typography: string;
  preferred_language: string;
  created_at: string;
  category?: string;
  community?: string;
  gender?: 'male' | 'female' | '';
  age?: number;
  annual_income?: number;
}

interface Props { profile: Profile; onSave: (data: Record<string, unknown>) => Promise<void>; }

const COMMUNITY_OPTIONS = ['SC', 'ST', 'Tribal', 'BC', 'MBC', 'DNC', 'Minority', 'General'];

export default function ProfileCard({ profile, onSave }: Props) {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const addressLabel = t.has('address') ? t('address') : 'Farm address';
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const initial = () => ({
    name: profile.name,
    typography: profile.typography,
    landAreaAcres: profile.land_area_acres,
    community: profile.community ?? '',
    gender: (profile.gender ?? '') as 'male' | 'female' | '',
    age: profile.age != null ? String(profile.age) : '',
    annualIncome: profile.annual_income != null ? String(profile.annual_income) : '',
  });
  const [form, setForm] = useState(initial);

  async function save() {
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name,
      typography: form.typography,
      landAreaAcres: Number(form.landAreaAcres),
    };
    // Optional eligibility fields — only send when set.
    if (form.community !== '') payload.community = form.community;
    if (form.gender !== '') payload.gender = form.gender;
    if (form.age !== '') payload.age = Number(form.age);
    if (form.annualIncome !== '') payload.annualIncome = Number(form.annualIncome);
    // Reflect snake_case fields locally so the card updates without a refetch.
    await onSave({
      ...payload,
      community: form.community || undefined,
      gender: form.gender || undefined,
      age: form.age !== '' ? Number(form.age) : undefined,
      annual_income: form.annualIncome !== '' ? Number(form.annualIncome) : undefined,
    });
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setForm(initial());
    setEditing(false);
  }

  const genderLabel = (g?: string) => (g === 'male' ? t('male') : g === 'female' ? t('female') : '—');

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center">
            <User className="w-7 h-7 text-brand-700" />
          </div>
          <div>
            {editing ? (
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="text-lg font-bold border-b-2 border-brand-400 outline-none" />
            ) : (
              <h3 className="text-lg font-bold text-gray-800">{profile.name}</h3>
            )}
            <p className="text-sm text-gray-500">{t('farmerId')}: {profile.farmer_id}</p>
          </div>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-1 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {tc('save')}
            </button>
            <button onClick={cancel} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800">
            <Edit2 className="w-3.5 h-3.5" /> {tc('edit')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <Phone className="w-4 h-4 text-gray-400" />
          <div><p className="text-xs text-gray-400">{t('phone')}</p><p className="font-medium text-gray-700">{toIndiaPhone(profile.phone)}</p></div>
        </div>
        <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-3 sm:col-span-2">
          <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">{addressLabel}</p>
            <p className="font-medium text-gray-700 whitespace-pre-wrap">{profile.address || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <Layers className="w-4 h-4 text-gray-400" />
          <div><p className="text-xs text-gray-400">{t('landArea')}</p>
            {editing ? (
              <input type="number" value={form.landAreaAcres} onChange={e => setForm({ ...form, landAreaAcres: +e.target.value })}
                className="font-medium w-20 border-b border-brand-400 outline-none" />
            ) : (
              <p className="font-medium text-gray-700">{profile.land_area_acres} {tc('acres')}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <MapPin className="w-4 h-4 text-gray-400" />
          <div><p className="text-xs text-gray-400">{t('landType')}</p>
            {editing ? (
              <input value={form.typography} onChange={e => setForm({ ...form, typography: e.target.value })}
                className="font-medium border-b border-brand-400 outline-none" />
            ) : (
              <p className="font-medium text-gray-700">{profile.typography || '—'}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <div className="w-4 h-4 text-gray-400 font-bold text-xs flex items-center justify-center">A</div>
          <div><p className="text-xs text-gray-400">{t('language')}</p>
            <p className="font-medium text-gray-700">{{ en: 'English', hi: 'हिन्दी', ta: 'தமிழ்' }[profile.preferred_language] ?? profile.preferred_language}</p>
          </div>
        </div>
      </div>

      {/* Optional eligibility details — power government-scheme matching */}
      <div className="mt-5 border-t border-gray-100 pt-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-gray-800">{t('eligibilityTitle')}</p>
          <p className="text-xs text-gray-400">{t('eligibilityHint')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
            <Users className="w-4 h-4 text-gray-400" />
            <div className="flex-1"><p className="text-xs text-gray-400">{t('community')}</p>
              {editing ? (
                <select value={form.community} onChange={e => setForm({ ...form, community: e.target.value })}
                  className="font-medium bg-transparent border-b border-brand-400 outline-none w-full">
                  <option value="">{t('notSpecified')}</option>
                  {COMMUNITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <p className="font-medium text-gray-700">{profile.community || '—'}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
            <UserCircle2 className="w-4 h-4 text-gray-400" />
            <div className="flex-1"><p className="text-xs text-gray-400">{t('gender')}</p>
              {editing ? (
                <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as 'male' | 'female' | '' })}
                  className="font-medium bg-transparent border-b border-brand-400 outline-none w-full">
                  <option value="">{t('notSpecified')}</option>
                  <option value="male">{t('male')}</option>
                  <option value="female">{t('female')}</option>
                </select>
              ) : (
                <p className="font-medium text-gray-700">{genderLabel(profile.gender)}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
            <Calendar className="w-4 h-4 text-gray-400" />
            <div className="flex-1"><p className="text-xs text-gray-400">{t('age')}</p>
              {editing ? (
                <input type="number" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })}
                  className="font-medium w-20 border-b border-brand-400 outline-none bg-transparent" />
              ) : (
                <p className="font-medium text-gray-700">{profile.age ?? '—'}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
            <IndianRupee className="w-4 h-4 text-gray-400" />
            <div className="flex-1"><p className="text-xs text-gray-400">{t('annualIncome')}</p>
              {editing ? (
                <input type="number" value={form.annualIncome} onChange={e => setForm({ ...form, annualIncome: e.target.value })}
                  className="font-medium w-28 border-b border-brand-400 outline-none bg-transparent" />
              ) : (
                <p className="font-medium text-gray-700">{profile.annual_income != null ? `₹${profile.annual_income.toLocaleString('en-IN')}` : '—'}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
