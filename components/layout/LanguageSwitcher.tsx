'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import Cookies from 'js-cookie';

const LANGS = [
  { code: 'en', label: 'EN', full: 'English' },
  { code: 'hi', label: 'हि', full: 'हिन्दी' },
  { code: 'ta', label: 'த', full: 'தமிழ்' },
];

export default function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('en');
  const router = useRouter();

  useEffect(() => {
    const locale = Cookies.get('locale') ?? 'en';
    setCurrent(locale);
  }, []);

  function switchLang(code: string) {
    Cookies.set('locale', code, { expires: 365 });
    setCurrent(code);
    setOpen(false);
    // Force page reload to apply language changes
    router.refresh();
    // Also reload to ensure all translations are updated
    setTimeout(() => window.location.reload(), 100);
  }

  const currentLang = LANGS.find(l => l.code === current) ?? LANGS[0];

  return (
    <div className="relative">
      <button 
        onClick={() => setOpen(!open)} 
        className="flex items-center gap-1 text-sm hover:text-brand-200 transition-colors px-2 py-1 rounded border border-brand-500"
        title="Change Language"
      >
        <Globe className="w-3.5 h-3.5" />
        <span>{currentLang.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white text-gray-800 rounded shadow-lg overflow-hidden z-50 min-w-[140px]">
          {LANGS.map(l => (
            <button 
              key={l.code} 
              onClick={() => switchLang(l.code)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 flex items-center gap-2 transition-colors ${
                l.code === current ? 'bg-brand-100' : ''
              }`}
            >
              <span className="font-medium w-6">{l.label}</span>
              <span className="text-gray-500">{l.full}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
