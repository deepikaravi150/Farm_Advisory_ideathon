import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Sprout, ArrowRight } from 'lucide-react';

export default async function HeroSection() {
  const t = await getTranslations('landing');
  return (
    <section className="bg-gradient-to-br from-brand-700 via-brand-600 to-earth-600 text-white py-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-white/10 rounded-full p-4">
            <Sprout className="w-16 h-16 text-brand-200" />
          </div>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold mb-4">
          FarmAdvisor
        </h1>
        <p className="text-xl md:text-2xl text-brand-100 mb-2">உங்கள் விவசாய நண்பன்</p>
        <p className="text-lg text-brand-200 mb-3">आपका कृषि सलाहकार</p>
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
