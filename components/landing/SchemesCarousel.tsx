'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { IndianRupee } from 'lucide-react';

interface Scheme {
  scheme_id: string;
  name: string;
  name_hi: string;
  name_ta: string;
  description_en: string;
  description_hi: string;
  description_ta: string;
  apply_url: string;
  image_url: string;
  fallback_image_url: string;
  image_alt: string;
  image_alt_hi: string;
  image_alt_ta: string;
}

const AGRISNET_SCHEMES_URL = 'https://www.tnagrisnet.tn.gov.in/home/schemes/';

const schemes: Scheme[] = [
  {
    scheme_id: 'pm-kisan',
    name: 'PM-KISAN Samman Nidhi',
    name_hi: 'पीएम-किसान सम्मान निधि',
    name_ta: 'பிஎம்-கிசான் சம்மான் நிதி',
    description_en: 'Direct income support for eligible landholding farmer families through bank transfer.',
    description_hi: 'पात्र भूमिधारक किसान परिवारों को बैंक हस्तांतरण के माध्यम से सीधी आय सहायता.',
    description_ta: 'தகுதியுள்ள நிலம் வைத்திருக்கும் விவசாய குடும்பங்களுக்கு வங்கி பரிமாற்றம் மூலம் நேரடி வருமான உதவி.',
    apply_url: 'https://pmkisan.gov.in/',
    image_url:
      'https://upload.wikimedia.org/wikipedia/commons/4/4e/PradhanMantriKisanSammanNidhi.jpg',
    fallback_image_url: '/scheme-images/pm-kisan.svg',
    image_alt: 'PM-KISAN scheme icon',
    image_alt_hi: 'पीएम-किसान योजना आइकन',
    image_alt_ta: 'பிஎம்-கிசான் திட்ட ஐகான்',
  },
  {
    scheme_id: 'pmfby',
    name: 'Pradhan Mantri Fasal Bima Yojana',
    name_hi: 'प्रधान मंत्री फसल बीमा योजना',
    name_ta: 'பிரதான் மந்திரி பயிர் காப்பீட்டு திட்டம்',
    description_en: 'Crop insurance support for farmers against losses from notified natural risks.',
    description_hi: 'सूचित प्राकृतिक जोखिमों से होने वाले नुकसान के लिए किसानों को फसल बीमा सहायता.',
    description_ta: 'அறிவிக்கப்பட்ட இயற்கை அபாயங்களால் ஏற்படும் இழப்புகளுக்கு விவசாயிகளுக்கான பயிர் காப்பீட்டு உதவி.',
    apply_url: 'https://pmfby.gov.in/',
    image_url: 'https://uxdt.nic.in/wp-content/uploads/2020/06/Pradhanmantri_phasal-Preview.png',
    fallback_image_url: '/scheme-images/pmfby.svg',
    image_alt: 'PMFBY scheme icon',
    image_alt_hi: 'फसल बीमा योजना आइकन',
    image_alt_ta: 'பயிர் காப்பீட்டு திட்ட ஐகான்',
  },
  {
    scheme_id: 'smam',
    name: 'Sub Mission on Agricultural Mechanization',
    name_hi: 'कृषि मशीनीकरण उप मिशन',
    name_ta: 'வேளாண் இயந்திரமயமாக்கல் துணை திட்டம்',
    description_en: 'Subsidy assistance for purchase of farm machinery and custom hiring centres.',
    description_hi: 'कृषि मशीनरी खरीद और कस्टम हायरिंग केंद्रों के लिए सब्सिडी सहायता.',
    description_ta: 'விவசாய இயந்திரங்கள் வாங்குதல் மற்றும் வாடகை சேவை மையங்களுக்கு மானிய உதவி.',
    apply_url:
      'https://aed.tn.gov.in/en/schemes/agricultural-mechanisation/sub-mission-on-agricultural-mechanisation/',
    image_url: 'https://aed.tn.gov.in/static/assets/images/schemes/BENEFITS-OFFERED-%28SUBSIDY%29.png',
    fallback_image_url: '/scheme-images/mechanization.svg',
    image_alt: 'Agricultural mechanization scheme icon',
    image_alt_hi: 'कृषि मशीनीकरण योजना आइकन',
    image_alt_ta: 'வேளாண் இயந்திரமயமாக்கல் திட்ட ஐகான்',
  },
  {
    scheme_id: 'soil-health-card',
    name: 'Soil Health Card',
    name_hi: 'मृदा स्वास्थ्य कार्ड',
    name_ta: 'மண் ஆரோக்கிய அட்டை',
    description_en: 'Soil testing based nutrient advice to help farmers plan healthier crop nutrition.',
    description_hi: 'मिट्टी परीक्षण आधारित पोषक सलाह, जिससे किसान बेहतर फसल पोषण की योजना बना सकें.',
    description_ta: 'மண் பரிசோதனை அடிப்படையிலான ஊட்டச்சத்து ஆலோசனை மூலம் ஆரோக்கியமான பயிர் ஊட்டச்சத்து திட்டமிட உதவும்.',
    apply_url: 'https://soilhealth.dac.gov.in/',
    image_url:
      'https://commons.wikimedia.org/wiki/Special:Redirect/file/Soil_Health_%2820220420-NRCS-UNK-026%29.jpg',
    fallback_image_url: '/scheme-images/soil-health.svg',
    image_alt: 'Soil Health Card scheme icon',
    image_alt_hi: 'मृदा स्वास्थ्य कार्ड आइकन',
    image_alt_ta: 'மண் ஆரோக்கிய அட்டை ஐகான்',
  },
  {
    scheme_id: 'tn-agrisnet',
    name: 'Tamil Nadu Agrisnet Schemes',
    name_hi: 'तमिलनाडु एग्रीसनेट योजनाएं',
    name_ta: 'தமிழ்நாடு அக்ரிஸ்நெட் திட்டங்கள்',
    description_en: 'State agriculture scheme listings and farmer welfare updates from Tamil Nadu Agrisnet.',
    description_hi: 'तमिलनाडु एग्रीसनेट से राज्य कृषि योजनाओं की सूची और किसान कल्याण अपडेट.',
    description_ta: 'தமிழ்நாடு அக்ரிஸ்நெட்டில் இருந்து மாநில வேளாண் திட்ட பட்டியல் மற்றும் விவசாய நல புதுப்பிப்புகள்.',
    apply_url: AGRISNET_SCHEMES_URL,
    image_url: '/scheme-images/tn-agrisnet.svg',
    fallback_image_url: '/scheme-images/tn-agrisnet.svg',
    image_alt: 'Tamil Nadu Agrisnet scheme icon',
    image_alt_hi: 'तमिलनाडु एग्रीसनेट योजना आइकन',
    image_alt_ta: 'தமிழ்நாடு அக்ரிஸ்நெட் திட்ட ஐகான்',
  },
];

function localizedText(locale: string) {
  if (locale === 'ta') {
    return {
      title: 'விவசாயிகளுக்கான அரசு திட்டங்கள்',
      subtitle: 'அதிகாரப்பூர்வ திட்ட இணைப்புகள் மற்றும் விரைவான விவசாயி உதவி குறிப்புகள்',
      aria: 'அரசு திட்டங்கள் நகரும் பட்டியல்',
    };
  }

  if (locale === 'hi') {
    return {
      title: 'किसानों के लिए सरकारी योजनाएं',
      subtitle: 'आधिकारिक योजना लिंक और त्वरित किसान सहायता जानकारी',
      aria: 'सरकारी योजनाओं की चलती सूची',
    };
  }

  return {
    title: 'Government Schemes for Farmers',
    subtitle: 'Official scheme links and quick farmer support highlights',
    aria: 'Government schemes marquee',
  };
}

function getSchemeDisplay(scheme: Scheme, locale: string) {
  if (locale === 'ta') {
    return {
      name: scheme.name_ta,
      description: scheme.description_ta,
      imageAlt: scheme.image_alt_ta,
    };
  }

  if (locale === 'hi') {
    return {
      name: scheme.name_hi,
      description: scheme.description_hi,
      imageAlt: scheme.image_alt_hi,
    };
  }

  return {
    name: scheme.name,
    description: scheme.description_en,
    imageAlt: scheme.image_alt,
  };
}

export default function SchemesCarousel() {
  const locale = useLocale();
  const text = localizedText(locale);
  const marqueeSchemes = useMemo(() => [...schemes, ...schemes], []);

  return (
    <section className="py-12 bg-earth-50 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-earth-800 flex items-center gap-2">
              <IndianRupee className="w-6 h-6 text-earth-600" />
              {text.title}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {text.subtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="relative border-y border-earth-200 bg-white">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-white to-transparent" />
        <div
          className="flex w-max gap-4 py-5 marquee-track"
          aria-label={text.aria}
        >
          {marqueeSchemes.map((scheme, index) => {
            const display = getSchemeDisplay(scheme, locale);
            return (
              <a
                key={`${scheme.scheme_id}-${index}`}
                href={scheme.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-[190px] w-[390px] shrink-0 overflow-hidden rounded-lg border border-emerald-300 bg-emerald-50 shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-100"
              >
                <span className="flex w-[150px] shrink-0 items-center justify-center bg-white">
                  <img
                    src={scheme.fallback_image_url}
                    alt={display.imageAlt}
                    className="h-28 w-28 object-contain"
                    loading="lazy"
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center px-5 py-4">
                  <span className="text-base font-bold leading-snug text-emerald-800">
                    {display.name}
                  </span>
                  <span className="mt-3 text-sm leading-snug text-gray-600">
                    {display.description}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
