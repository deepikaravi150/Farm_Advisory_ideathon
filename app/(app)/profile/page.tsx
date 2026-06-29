'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import ProfileCard from '@/components/profile/ProfileCard';
import FarmerMemorySection from '@/components/profile/FarmerMemorySection';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { Loader2, Landmark, LogOut, ChevronRight } from 'lucide-react';
import type { Fact } from '@/lib/memory';

interface Profile {
  farmer_id: string;
  name: string;
  phone: string;
  address?: string;
  land_area_acres: number;
  typography: string;
  preferred_language: string;
  created_at: string;
  memory?: Fact[];
  category?: string;
  community?: string;
  gender?: 'male' | 'female' | '';
  age?: number;
  annual_income?: number;
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  const tNav = useTranslations('nav');
  const tSchemes = useTranslations('schemes');
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/farmer/profile')
      .then((r) => r.json())
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(data: Record<string, unknown>) {
    await fetch('/api/farmer/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setProfile((prev) => (prev ? { ...prev, ...(data as Partial<Profile>) } : prev));
  }

  async function logout() {
    await fetch('/api/auth/login', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-28 pt-5">
      <div className="mb-4 flex items-start justify-between">
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
        <LanguageSwitcher />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
          <Landmark className="h-4 w-4" /> Details synced from government records.
        </div>

        {profile && <ProfileCard profile={profile} onSave={saveProfile} />}

        <Link
          href="/schemes"
          className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:bg-brand-50"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100">
            <Landmark className="h-5 w-5 text-brand-700" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-800">{tSchemes('titleShort')}</p>
            <p className="text-xs text-gray-500">{tSchemes('entryHint')}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300" />
        </Link>

        {profile && <FarmerMemorySection initialFacts={profile.memory ?? []} />}

        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-3 font-semibold text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" /> {tNav('logout')}
        </button>
      </div>
    </div>
  );
}
