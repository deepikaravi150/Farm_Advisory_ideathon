import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { Sprout, ArrowRight } from 'lucide-react';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';

export default async function HeroSection() {
  const t = await getTranslations('landing');
  const locale = await getLocale();
  const subtitle = locale === 'ta'
    ? 'உங்கள் விவசாய நண்பன்'
    : locale === 'hi'
      ? 'आपका कृषि सलाहकार'
      : 'Your farming friend';
  return (
    <section className="relative bg-gradient-to-br from-brand-700 via-brand-600 to-earth-600 text-white py-20 px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="max-w-4xl mx-auto text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-white/10 rounded-full p-4">
            <Sprout className="w-16 h-16 text-brand-200" />
          </div>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold mb-4">
          FarmAdvisor
        </h1>
        <p className="text-xl md:text-2xl text-brand-100 mb-3">{subtitle}</p>
        <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
          {t('tagline')}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/login"
            className="bg-white text-brand-700 font-semibold px-8 py-3 rounded-xl hover:bg-brand-50 transition-colors flex items-center justify-center gap-2">
            {t('login')} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/register"
            className="bg-brand-500 text-white font-semibold px-8 py-3 rounded-xl hover:bg-brand-400 transition-colors border border-brand-400 flex items-center justify-center gap-2">
            {t('registerFree')}
          </Link>
        </div>
      </div>
    </section>
  );
}
