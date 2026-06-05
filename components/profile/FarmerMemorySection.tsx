'use client';
import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Brain, Sprout, Map, Droplets, FlaskConical, Bug, Heart, StickyNote, Plus, X, Loader2 } from 'lucide-react';
import { MEMORY_CATEGORIES, type Fact, type MemoryCategory } from '@/lib/memory';

interface Props {
  initialFacts: Fact[];
}

const CATEGORY_ICON: Record<MemoryCategory, React.ComponentType<{ className?: string }>> = {
  crop: Sprout,
  land: Map,
  irrigation: Droplets,
  soil: FlaskConical,
  pest: Bug,
  preference: Heart,
  other: StickyNote,
};

export default function FarmerMemorySection({ initialFacts }: Props) {
  const locale = useLocale();
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);
  const [facts, setFacts] = useState<Fact[]>(initialFacts);
  const [newNote, setNewNote] = useState('');
  const [category, setCategory] = useState<MemoryCategory>('other');
  const [busy, setBusy] = useState(false);

  // Refresh from the server so facts auto-captured from chats show up.
  useEffect(() => {
    fetch('/api/farmer/memory')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.facts)) setFacts(d.facts); })
      .catch(() => undefined);
  }, []);

  const categoryLabel = (c: MemoryCategory) => ({
    crop: t('Crops', 'फसलें', 'பயிர்கள்'),
    land: t('Land', 'भूमि', 'நிலம்'),
    irrigation: t('Irrigation', 'सिंचाई', 'பாசனம்'),
    soil: t('Soil', 'मिट्टी', 'மண்'),
    pest: t('Pests & disease', 'कीट और रोग', 'பூச்சி & நோய்'),
    preference: t('Preferences', 'पसंद', 'விருப்பங்கள்'),
    other: t('Other', 'अन्य', 'மற்றவை'),
  }[c]);

  async function addNote() {
    const text = newNote.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/farmer/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, category }),
      });
      const data = await res.json();
      if (Array.isArray(data?.facts)) setFacts(data.facts);
      setNewNote('');
    } catch {
      /* keep input on failure */
    } finally {
      setBusy(false);
    }
  }

  async function removeFact(id: string) {
    const prev = facts;
    setFacts(facts.filter((f) => f.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/farmer/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (Array.isArray(data?.facts)) setFacts(data.facts);
    } catch {
      setFacts(prev); // revert on failure
    }
  }

  const grouped = MEMORY_CATEGORIES
    .map((c) => ({ category: c, items: facts.filter((f) => f.category === c) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-1">
        <Brain className="w-5 h-5 text-brand-600" /> {t('What we know about your farm', 'आपके खेत के बारे में हमारी जानकारी', 'உங்கள் பண்ணை பற்றி நாங்கள் அறிந்தவை')}
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        {t(
          'These notes are saved automatically from your chats and used to personalize advice. You can add or remove them.',
          'ये बातें आपकी चैट से अपने-आप सहेजी जाती हैं और सलाह को बेहतर बनाने में मदद करती हैं। आप जोड़ या हटा सकते हैं।',
          'இவை உங்கள் அரட்டையிலிருந்து தானாகச் சேமிக்கப்படும்; ஆலோசனையை சிறப்பாக்க பயன்படும். நீங்கள் சேர்க்கலாம்/நீக்கலாம்.',
        )}
      </p>

      {grouped.length === 0 ? (
        <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-400">
          {t('Nothing saved yet. Chat with the advisor and key facts about your farm will appear here.', 'अभी कुछ सहेजा नहीं गया। सलाहकार से बात करें, आपके खेत की मुख्य बातें यहाँ दिखेंगी।', 'இன்னும் எதுவும் சேமிக்கப்படவில்லை. ஆலோசகருடன் பேசுங்கள், முக்கிய தகவல்கள் இங்கே தோன்றும்.')}
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ category: c, items }) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <div key={c}>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Icon className="h-3.5 w-3.5 text-brand-600" /> {categoryLabel(c)}
                </p>
                <ul className="space-y-1.5">
                  {items.map((f) => (
                    <li key={f.id} className="group flex items-start justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                      <span className="text-sm text-gray-700">{f.text}</span>
                      <button
                        type="button"
                        onClick={() => removeFact(f.id)}
                        title={t('Remove', 'हटाएं', 'நீக்கு')}
                        className="mt-0.5 text-gray-300 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual add */}
      <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          className="rounded-lg border border-gray-200 px-2 py-2 text-sm focus:border-brand-400 focus:outline-none"
        >
          {MEMORY_CATEGORIES.map((c) => (
            <option key={c} value={c}>{categoryLabel(c)}</option>
          ))}
        </select>
        <input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }}
          maxLength={280}
          placeholder={t('Add a note about your farm…', 'अपने खेत के बारे में एक नोट जोड़ें…', 'உங்கள் பண்ணை பற்றி குறிப்பு சேர்க்கவும்…')}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={addNote}
          disabled={!newNote.trim() || busy}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t('Add', 'जोड़ें', 'சேர்')}
        </button>
      </div>
    </div>
  );
}
