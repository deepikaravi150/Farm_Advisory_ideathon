'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, IndianRupee } from 'lucide-react';

interface Scheme {
  scheme_id?: string;
  name?: string;
  Scheme_Name?: string;
  description_en?: string;
  eligibility?: string;
  deadline?: string;
  apply_url?: string;
}

const AGRISNET_SCHEMES_URL = 'https://www.tnagrisnet.tn.gov.in/home/schemes/';

const fallbackSchemes: Scheme[] = [
  {
    scheme_id: 'uatt',
    name: 'Uzhavar Aluvalar Thodarbu Thittam (UATT)',
    description_en: 'Farmer-officer contact support listed by Tamil Nadu Agrisnet.',
    apply_url: AGRISNET_SCHEMES_URL,
  },
  {
    scheme_id: 'collective-farming',
    name: 'Collective Farming',
    description_en: 'Tamil Nadu farmer group support initiative listed by Agrisnet.',
    apply_url: AGRISNET_SCHEMES_URL,
  },
  {
    scheme_id: 'tnmsdd',
    name: 'TamilNadu Mission for Sustainable Dry Land Developement (TNMSDD)',
    description_en: 'Dry land development mission listed by Tamil Nadu Agrisnet.',
    apply_url: AGRISNET_SCHEMES_URL,
  },
];

function getSchemeName(scheme: Scheme) {
  return scheme.name || scheme.Scheme_Name || 'Government Scheme';
}

export default function SchemesCarousel() {
  const [schemes, setSchemes] = useState<Scheme[]>(fallbackSchemes);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/schemes')
      .then(r => (r.ok ? r.json() : []))
      .then(data => {
        if (Array.isArray(data) && data.length) {
          setSchemes(data);
        }
      })
      .catch(() => {
        setSchemes(fallbackSchemes);
      })
      .finally(() => setLoading(false));
  }, []);

  const marqueeSchemes = useMemo(() => [...schemes, ...schemes], [schemes]);

  return (
    <section className="py-12 bg-earth-50 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-earth-800 flex items-center gap-2">
              <IndianRupee className="w-6 h-6 text-earth-600" />
              Government Schemes for Farmers
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Tamil Nadu Agrisnet scheme highlights before login
            </p>
          </div>
          <a
            href={AGRISNET_SCHEMES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-900"
          >
            View official schemes
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="relative border-y border-earth-200 bg-white">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-white to-transparent" />
        <div
          className={`flex w-max gap-4 py-5 marquee-track ${loading ? 'opacity-70' : ''}`}
          aria-label="Government schemes marquee"
        >
          {marqueeSchemes.map((scheme, index) => (
            <a
              key={`${scheme.scheme_id || getSchemeName(scheme)}-${index}`}
              href={scheme.apply_url || AGRISNET_SCHEMES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex w-[280px] sm:w-[340px] shrink-0 flex-col justify-between rounded-lg border border-brand-100 bg-brand-50 px-5 py-4 transition-colors hover:border-brand-300 hover:bg-white"
            >
              <span className="text-base font-semibold text-brand-800 line-clamp-2">
                {getSchemeName(scheme)}
              </span>
              {scheme.description_en && (
                <span className="mt-2 text-sm text-gray-600 line-clamp-2">
                  {scheme.description_en}
                </span>
              )}
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-earth-700">
                Check details
                <ExternalLink className="w-3.5 h-3.5" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
 