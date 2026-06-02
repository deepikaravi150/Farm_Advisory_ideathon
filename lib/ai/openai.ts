import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY ?? '';
const chatModel = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o';
const embedModel = process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small';
const ttsModel = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
const ttsVoice = process.env.OPENAI_TTS_VOICE ?? 'alloy';
const sttModel = process.env.OPENAI_STT_MODEL ?? 'whisper-1';

const client = new OpenAI({ apiKey });

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** Max output tokens. Raise for large structured responses (e.g. crop plans). */
  maxTokens?: number;
  /** Force a valid JSON object response (OpenAI json_object mode). */
  json?: boolean;
}

/**
 * Core chat completion. Mirrors the previous Bedrock signature so route code
 * stays unchanged. `systemPrompt` is sent as the system message.
 */
export async function chatWithBedrock(
  messages: Message[],
  systemPrompt: string,
  options: ChatOptions = {}
): Promise<string> {
  const res = await client.chat.completions.create({
    model: chatModel,
    max_tokens: options.maxTokens ?? 2048,
    ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  return res.choices[0]?.message?.content ?? '';
}

/**
 * Vision extraction. `mediaType` + base64 are turned into a data URL.
 * NOTE: OpenAI chat vision accepts images (jpeg/png/webp/gif) only — PDFs are
 * not supported here and must be converted to an image upstream.
 */
export async function extractTextFromDocument(
  base64Content: string,
  mediaType: string,
  extractionPrompt: string
): Promise<string> {
  const res = await client.chat.completions.create({
    model: chatModel,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${base64Content}` },
          },
          { type: 'text', text: extractionPrompt },
        ],
      },
    ],
  });
  return res.choices[0]?.message?.content ?? '';
}

export async function summarizeText(text: string): Promise<string> {
  return chatWithBedrock(
    [
      {
        role: 'user',
        content: `Summarize this farming conversation in 2-3 sentences, focusing on agronomic decisions and crop information:\n\n${text}`,
      },
    ],
    'You are an expert agronomist summarizing farmer consultations.'
  );
}

export async function extractFarmingContextTags(text: string): Promise<string[]> {
  const res = await client.chat.completions.create({
    model: chatModel,
    max_tokens: 256,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You extract structured farming metadata tags from text. Return only valid JSON of the form {"tags": ["paddy", "kharif", ...]}.',
      },
      {
        role: 'user',
        content: `Extract farming context tags from this text. Return a JSON object with a single "tags" array of short tag strings (e.g. {"tags": ["paddy", "kharif", "irrigation", "pest_control"]}). Text:\n\n${text}`,
      },
    ],
  });
  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}');
    return Array.isArray(parsed.tags) ? parsed.tags : [];
  } catch {
    return [];
  }
}

/** Embed a single piece of text. Returns a 1536-dim vector for text-embedding-3-small. */
export async function embedText(text: string): Promise<number[]> {
  const res = await client.embeddings.create({
    model: embedModel,
    input: text,
  });
  return res.data[0].embedding;
}

/**
 * Text-to-speech via OpenAI. Multilingual voices speak en/hi/ta correctly
 * (unlike AWS Polly, which has no Tamil voice). Returns an MP3 buffer.
 */
export async function synthesizeSpeech(text: string, _locale: string): Promise<Buffer> {
  const res = await client.audio.speech.create({
    model: ttsModel,
    voice: ttsVoice,
    input: text,
  });
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Speech-to-text via OpenAI Whisper. Accepts the browser's WebM/Opus recording
 * directly. `locale` is an ISO-639-1 hint (en/hi/ta) to improve accuracy.
 */
export async function transcribeAudio(file: File, locale: string): Promise<string> {
  const res = await client.audio.transcriptions.create({
    file,
    model: sttModel,
    language: locale,
  });
  return res.text.trim();
}

/** Embed many texts in one request (used by the ingestion script). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await client.embeddings.create({
    model: embedModel,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}
