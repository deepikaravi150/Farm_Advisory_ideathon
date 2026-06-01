import {
  PollyClient,
  SynthesizeSpeechCommand,
  Engine,
  OutputFormat,
  VoiceId,
  LanguageCode,
} from '@aws-sdk/client-polly';

const polly = new PollyClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });

const VOICE_MAP: Record<string, VoiceId> = {
  'en': VoiceId.Aditi,
  'hi': VoiceId.Aditi,
  'ta': VoiceId.Aditi,
};

// Note: Polly has no Tamil (ta-IN) voice; 'ta' falls back to the Aditi en-IN/hi-IN voice.
const LANGUAGE_CODE_MAP: Record<string, LanguageCode> = {
  'en': 'en-IN',
  'hi': 'hi-IN',
  'ta': 'hi-IN',
};

export async function synthesizeSpeech(text: string, locale: string): Promise<Buffer> {
  const languageCode = LANGUAGE_CODE_MAP[locale] ?? 'en-IN';
  const voiceId = VOICE_MAP[locale] ?? VoiceId.Aditi;

  const command = new SynthesizeSpeechCommand({
    Text: text,
    OutputFormat: OutputFormat.MP3,
    VoiceId: voiceId,
    Engine: Engine.STANDARD,
    LanguageCode: languageCode,
  });

  const res = await polly.send(command);
  if (!res.AudioStream) throw new Error('No audio stream returned from Polly');

  const chunks: Uint8Array[] = [];
  for await (const chunk of res.AudioStream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
