'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';
import Cookies from 'js-cookie';

const LANGS = [
  { code: 'en', label: 'EN', full: 'English' },
  { code: 'hi', label: 'हि', full: 'हिन्दी' },
  { code: 'ta', label: 'த', full: 'தமிழ்' },
];

export default function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const current = useLocale();

  function switchLang(code: string) {
    Cookies.set('locale', code, { expires: 365 });
    setOpen(false);
    router.refresh();
  }

  const currentLang = LANGS.find(l => l.code === current) ?? LANGS[0];

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-sm hover:text-brand-200 transition-colors px-2 py-1 rounded border border-brand-500">
        <Globe className="w-3.5 h-3.5" />
        <span>{currentLang.label}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white text-gray-800 rounded shadow-lg overflow-hidden z-50 min-w-[120px]">
          {LANGS.map(l => (
            <button key={l.code} onClick={() => switchLang(l.code)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 flex items-center gap-2">
              <span className="font-medium w-6">{l.label}</span>
              <span className="text-gray-500">{l.full}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
