'use client';
import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';

interface VoiceOutputProps { text: string; locale: string; }

const BCP47: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' };

/**
 * Convert markdown/assistant formatting into clean, speakable plain text.
 * Without this, TTS engines mangle bullet/number markers and symbols — which
 * is why Tamil playback previously sounded like it was "only reading numbers".
 */
function toSpeakableText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')        // code blocks
    .replace(/`([^`]+)`/g, '$1')             // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')   // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')      // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // bold
    .replace(/\*([^*]+)\*/g, '$1')           // italic
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')           // bullet markers
    .replace(/^\s*\d+[.)]\s+/gm, '')         // numbered-list markers (1. 2) etc.)
    .replace(/[#*_>`~|]/g, ' ')              // stray markdown symbols
    .replace(/\n{2,}/g, '. ')                // paragraph breaks -> pause
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** True if the browser exposes a usable voice for the given BCP-47 lang. */
function findVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const prefix = lang.split('-')[0];
  return (
    voices.find(v => v.lang === lang) ??
    voices.find(v => v.lang?.toLowerCase().startsWith(prefix)) ??
    null
  );
}

export default function VoiceOutput({ text, locale }: VoiceOutputProps) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const t = useTranslations('chat');

  // Prime the voice list — some browsers populate it asynchronously, so the
  // first getVoices() call can be empty until this fires.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    const handler = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', handler);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', handler);
      window.speechSynthesis.cancel();
    };
  }, []);

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    setPlaying(false);
  }

  /** Browser-native TTS — needed for Tamil since AWS Polly has no Tamil voice. */
  function speakWithBrowser(spoken: string, lang: string): boolean {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    const voice = findVoice(lang);
    if (!voice) return false;
    const utter = new SpeechSynthesisUtterance(spoken);
    utter.voice = voice;
    utter.lang = voice.lang || lang;
    utter.rate = 0.95;
    utter.onend = () => setPlaying(false);
    utter.onerror = () => setPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    setPlaying(true);
    return true;
  }

  /** AWS Polly via our API — used for English/Hindi (good neural voices). */
  async function speakWithPolly(spoken: string) {
    const res = await fetch('/api/speech/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: spoken.slice(0, 3000), locale }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
    await audio.play();
    setPlaying(true);
  }

  async function speak() {
    if (playing) { stop(); return; }
    const spoken = toSpeakableText(text);
    if (!spoken) return;
    setLoading(true);
    try {
      const lang = BCP47[locale] ?? 'en-IN';
      // Tamil: prefer the browser's native Tamil voice. Polly cannot speak Tamil
      // and would only read out the numerals, so only fall back to it if the
      // device truly has no Tamil voice.
      if (locale === 'ta') {
        if (speakWithBrowser(spoken, lang)) return;
      }
      await speakWithPolly(spoken);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <button className="mt-1 text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /></button>;

  return (
    <button onClick={speak} className="mt-1 text-gray-400 hover:text-brand-600 transition-colors" title={t('listen')}>
      {playing ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
    </button>
  );
}
