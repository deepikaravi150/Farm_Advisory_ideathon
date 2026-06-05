'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import ProfileCard from '@/components/profile/ProfileCard';
import SoilReportUpload from '@/components/profile/SoilReportUpload';
import FarmerMemorySection from '@/components/profile/FarmerMemorySection';
import { Loader2, FlaskConical } from 'lucide-react';
import type { Fact } from '@/lib/memory';

interface Profile { farmer_id: string; name: string; phone: string; address?: string; land_area_acres: number; typography: string; preferred_language: string; created_at: string; memory?: Fact[]; }
interface SoilData {
  ph: number;
  nitrogen: string;
  phosphorus: string;
  potassium: string;
  organicCarbon: string;
  electricalConductivity?: number | null;
  micronutrients?: Record<string, string | null>;
  plainLanguageSummary?: string | null;
  keyFindings?: string[] | null;
  recommendations: string;
  labName: string;
  reportDate: string;
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [soilData, setSoilData] = useState<SoilData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/farmer/profile').then(r => r.json()).then(p => setProfile(p)).finally(() => setLoading(false));
  }, []);

  async function saveProfile(data: Partial<Profile>) {
    await fetch('/api/farmer/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setProfile(prev => prev ? { ...prev, ...data } : prev);
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar farmerName={profile?.name} />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('title')}</h1>
        {profile && <ProfileCard profile={profile} onSave={saveProfile} />}

        <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
            <FlaskConical className="w-5 h-5 text-brand-600" /> {t('soilReportTitle')}
          </h2>
          <p className="text-sm text-gray-500 mb-4">{t('soilReportSubtitle')}</p>
          <SoilReportUpload onUploadSuccess={setSoilData} />
        </div>

        {profile && <FarmerMemorySection initialFacts={profile.memory ?? []} />}
      </div>
    </div>
  );
}
