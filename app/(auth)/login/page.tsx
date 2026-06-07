'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Sprout, Phone, Lock, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { toTenDigitPhone } from '@/lib/phone';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('login');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, locale }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t('failed')); return; }
      router.push('/dashboard');
    } catch { setError(tc('networkError')); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-earth-50 flex items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Sprout className="w-8 h-8 text-brand-600" />
          <span className="text-2xl font-bold text-brand-700">FarmAdvisor</span>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-1 text-center">{t('welcome')}</h1>
        <p className="text-sm text-gray-500 text-center mb-6">{t('subtitle')}</p>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-600 rounded-xl px-4 py-3 mb-4 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')}</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <span className="absolute left-10 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">+91</span>
              <input value={phone} onChange={e => setPhone(toTenDigitPhone(e.target.value))} placeholder={t('phonePlaceholder')} inputMode="numeric"
                className="w-full pl-20 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('passwordPlaceholder')}
                className="w-full pl-10 pr-11 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" required />
              <button type="button" onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-brand-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? t('loggingIn') : t('loginBtn')}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 mt-6">
          {t('newFarmer')}{' '}
          <Link href="/register" className="text-brand-600 hover:text-brand-800 font-medium">{t('registerHere')}</Link>
        </p>
        <p className="text-xs text-center text-gray-400 mt-4">{t('copyright')}</p>
      </div>
    </div>
  );
}
 
