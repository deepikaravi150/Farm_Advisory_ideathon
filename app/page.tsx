import { getTranslations } from 'next-intl/server';
import HeroSection from '@/components/landing/HeroSection';
import SchemesCarousel from '@/components/landing/SchemesCarousel';
import { Sprout, Cpu, CloudRain, Phone } from 'lucide-react';

export default async function LandingPage() {
  const t = await getTranslations('landing');

  const features = [
    { icon: Cpu, title: t('feature1Title'), desc: t('feature1Desc') },
    { icon: CloudRain, title: t('feature2Title'), desc: t('feature2Desc') },
    { icon: Sprout, title: t('feature3Title'), desc: t('feature3Desc') },
    { icon: Phone, title: t('feature4Title'), desc: t('feature4Desc') },
  ];

  return (
    <main>
      <HeroSection />
      <section className="py-14 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-10">{t('featuresTitle')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map(f => (
              <div key={f.title} className="bg-brand-50 rounded-2xl p-5 border border-brand-100">
                <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center mb-3">
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <SchemesCarousel />
      <footer className="bg-brand-800 text-brand-200 text-center py-6 text-sm">
        <p>{t('footer')}</p>
      </footer>
    </main>
  );
}
