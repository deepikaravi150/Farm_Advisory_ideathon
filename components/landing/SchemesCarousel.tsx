'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, ChevronLeft, ChevronRight, IndianRupee } from 'lucide-react';

interface Scheme {
  scheme_id: string;
  name: string;
  description_en: string;
  eligibility: string;
  deadline: string;
  apply_url?: string;
}

export default function SchemesCarousel() {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const t = useTranslations('schemes');

  useEffect(() => {
    fetch('/api/schemes').then(r => r.json()).then(data => {
      setSchemes(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <section className="py-12 px-4 bg-earth-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-earth-800 mb-6 text-center">{t('titleShort')}</h2>
        <div className="animate-pulse bg-white rounded-2xl h-48" />
      </div>
    </section>
  );

  if (!schemes.length) return (
    <section className="py-12 px-4 bg-earth-50">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-2xl font-bold text-earth-800 mb-4">{t('titleShort')}</h2>
        <p className="text-gray-500">{t('empty')}</p>
      </div>
    </section>
  );

  const scheme = schemes[idx];

  return (
    <section className="py-12 px-4 bg-earth-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-earth-800 mb-6 text-center flex items-center justify-center gap-2">
          <IndianRupee className="w-6 h-6 text-earth-600" /> {t('title')}
        </h2>
        <div className="relative bg-white rounded-2xl shadow-md p-6 border border-earth-200">
          <div className="mb-2 flex items-start justify-between gap-4">
            <h3 className="text-xl font-semibold text-brand-700">{scheme.name}</h3>
            {scheme.apply_url && (
              <a href={scheme.apply_url} target="_blank" rel="noopener noreferrer"
                className="text-brand-600 hover:text-brand-800 flex-shrink-0">
                <ExternalLink className="w-5 h-5" />
              </a>
            )}
          </div>
          <p className="text-gray-600 mb-3">{scheme.description_en}</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="bg-brand-100 text-brand-700 px-3 py-1 rounded-full">
              {t('eligibility')}: {scheme.eligibility}
            </span>
            {scheme.deadline && (
              <span className="bg-earth-100 text-earth-700 px-3 py-1 rounded-full">
                {t('deadline')}: {scheme.deadline}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-4">
            <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}
              className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-30">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-400">{idx + 1} / {schemes.length}</span>
            <button onClick={() => setIdx(Math.min(schemes.length - 1, idx + 1))} disabled={idx === schemes.length - 1}
              className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
