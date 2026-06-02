'use client';
import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';

interface VoiceOutputProps { text: string; locale: string; }

/**
 * Convert markdown/assistant formatting into clean, speakable plain text.
 * Without this, TTS engines mangle bullet/number markers and symbols.
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

export default function VoiceOutput({ text, locale }: VoiceOutputProps) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const t = useTranslations('chat');

  // Stop any in-flight playback when the component unmounts.
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  }

  /** OpenAI TTS via our API — multilingual voices cover en/hi/ta. */
  async function speakWithApi(spoken: string) {
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
      await speakWithApi(spoken);
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
