import HeroSection from '@/components/landing/HeroSection';
import SchemesCarousel from '@/components/landing/SchemesCarousel';
import { Sprout, Cpu, CloudRain, Phone } from 'lucide-react';

const features = [
  { icon: Cpu, title: 'AI Crop Planning', desc: 'Get personalized crop recommendations based on your land, soil, and weather.' },
  { icon: CloudRain, title: 'Weather Alerts', desc: 'SMS alerts when extreme weather threatens your crops — in your language.' },
  { icon: Sprout, title: 'Full Season Guide', desc: 'From sowing to selling — a visual plan covering every stage of farming.' },
  { icon: Phone, title: 'Voice & Multilingual', desc: 'Ask questions by voice in Tamil, Hindi, or English — get answers instantly.' },
];

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <section className="py-14 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-10">Everything a Tamil Nadu farmer needs</h2>
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
        <p>© 2025 FarmAdvisor · Built for Tamil Nadu Farmers · AI-powered by OpenAI</p>
      </footer>
    </main>
  );
}
