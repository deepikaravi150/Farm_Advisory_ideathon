import { NextRequest, NextResponse } from 'next/server';
import { findFarmersByPhone } from '@/app/api/auth/farmers';
import { toTenDigitPhone } from '@/lib/phone';
import { queryItems, Tables } from '@/lib/aws/dynamodb';
import { generateChatReply, type Message } from '@/lib/chat-engine';
import { transcribeAudio } from '@/lib/ai/openai';
import {
  sendWhatsApp,
  downloadTwilioMedia,
  validateTwilioSignature,
} from '@/lib/whatsapp/twilio';

// The crop-photo / LLM path can take a while; allow the work up to 60s.
export const maxDuration = 60;

// Empty TwiML — we acknowledge Twilio immediately and send the real reply
// out-of-band via the REST API, so the LLM latency never trips Twilio's
// ~15s webhook timeout.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
function ack(status = 200) {
  return new NextResponse(EMPTY_TWIML, { status, headers: { 'Content-Type': 'text/xml' } });
}

type Locale = 'en' | 'hi' | 'ta';

const NON_TEXT_MEDIA: Record<Locale, string> = {
  en: 'I can read text and crop photos for now. Please send your question as text, or a clear close-up photo of the crop. 🌱',
  hi: 'अभी मैं टेक्स्ट और फसल की फोटो समझ सकता हूँ। कृपया अपना सवाल टेक्स्ट में भेजें, या फसल की साफ नज़दीकी फोटो भेजें। 🌱',
  ta: 'இப்போதைக்கு நான் உரை மற்றும் பயிர் புகைப்படங்களை மட்டுமே படிக்க முடியும். உங்கள் கேள்வியை உரையாகவோ அல்லது பயிரின் தெளிவான புகைப்படமாகவோ அனுப்பவும். 🌱',
};

const ERROR_REPLY: Record<Locale, string> = {
  en: 'Sorry, something went wrong on our side. Please try again in a moment. 🙏',
  hi: 'क्षमा करें, हमारी ओर से कुछ गड़बड़ हुई। कृपया थोड़ी देर बाद फिर प्रयास करें। 🙏',
  ta: 'மன்னிக்கவும், எங்கள் தரப்பில் ஏதோ தவறு ஏற்பட்டது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும். 🙏',
};

const VOICE_FAILED: Record<Locale, string> = {
  en: "I couldn't process that voice note. Please try again, or send your question as text. 🎙️",
  hi: 'मैं वह वॉइस नोट समझ नहीं पाया। कृपया दोबारा भेजें, या अपना सवाल टेक्स्ट में भेजें। 🎙️',
  ta: 'அந்த குரல் செய்தியை என்னால் செயலாக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது உங்கள் கேள்வியை உரையாக அனுப்பவும். 🎙️',
};

const VOICE_EMPTY: Record<Locale, string> = {
  en: "I couldn't hear anything clearly in that voice note. Please record again in a quiet spot. 🎙️",
  hi: 'उस वॉइस नोट में मुझे कुछ साफ़ सुनाई नहीं दिया। कृपया शांत जगह पर दोबारा रिकॉर्ड करें। 🎙️',
  ta: 'அந்த குரல் செய்தியில் எதுவும் தெளிவாகக் கேட்கவில்லை. அமைதியான இடத்தில் மீண்டும் பதிவு செய்யவும். 🎙️',
};

// Shown above the answer so the farmer can confirm what we understood from voice.
function heardLine(locale: Locale, transcript: string): string {
  const label = locale === 'ta' ? 'நான் கேட்டது' : locale === 'hi' ? 'मैंने सुना' : 'I heard';
  return `🎙️ _${label}: "${transcript}"_`;
}

function notRegisteredMessage(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '';
  return `🌾 This WhatsApp number isn't registered with FarmAdvisor yet.${
    url ? ` Please sign up first at ${url}` : ' Please sign up in the FarmAdvisor app first.'
  }`;
}

function pickLocale(value: unknown): Locale {
  const v = String(value ?? '');
  return v === 'hi' || v === 'ta' ? v : 'en';
}

/**
 * Twilio WhatsApp inbound webhook. Twilio POSTs each message as
 * application/x-www-form-urlencoded with fields like From, Body, NumMedia,
 * MediaUrl0, MediaContentType0. The sender's phone number IS the identity:
 * we map it to a registered farmer and run the shared chat engine.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return ack();
  }

  // Optional signature check — enable once WHATSAPP_WEBHOOK_URL is stable.
  if (process.env.TWILIO_VALIDATE_SIGNATURE === 'true') {
    const params: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') params[key] = value;
    }
    const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL ?? req.url;
    const ok = validateTwilioSignature(req.headers.get('x-twilio-signature'), webhookUrl, params);
    if (!ok) {
      console.error('Rejected WhatsApp webhook: invalid Twilio signature');
      return ack(403);
    }
  }

  const from = String(form.get('From') ?? '');            // "whatsapp:+919876543210"
  const body = String(form.get('Body') ?? '').trim();
  const numMedia = parseInt(String(form.get('NumMedia') ?? '0'), 10) || 0;
  const mediaUrl = numMedia > 0 ? String(form.get('MediaUrl0') ?? '') : '';
  const mediaType = numMedia > 0 ? String(form.get('MediaContentType0') ?? '') : '';

  const phone = toTenDigitPhone(from.replace('whatsapp:', ''));
  if (!from || !phone) return ack();

  // "join <keyword>" is the Twilio sandbox opt-in control phrase (used by our
  // registration flow). If one reaches us, ignore it rather than replying.
  if (/^join\b/i.test(body) && !mediaUrl) return ack();

  // Acknowledge Twilio right away; do the slow work out-of-band. This is safe on
  // a long-running server (EC2/pm2). On a frozen serverless platform, switch to
  // `import { after } from 'next/server'` and run handleMessage inside after().
  handleMessage({ from, phone, body, mediaUrl, mediaType }).catch((e) => {
    console.error('WhatsApp handler error:', e);
  });

  return ack();
}

async function handleMessage(args: {
  from: string;
  phone: string;
  body: string;
  mediaUrl: string;
  mediaType: string;
}) {
  const { from, phone, body, mediaUrl, mediaType } = args;

  // "Registered users only" — the phone number is already verified by WhatsApp.
  const farmers = await findFarmersByPhone(phone);
  if (!farmers.length) {
    console.log(`[WhatsApp] ${phone} is not a registered farmer — sent sign-up prompt`);
    await sendWhatsApp(from, notRegisteredMessage());
    return;
  }

  const f = farmers[0];
  const farmer = {
    farmerId: String(f.farmer_id),
    phone: String(f.phone),
    name: String(f.name ?? 'Farmer'),
  };
  const locale = pickLocale(f.preferred_language);

  // Handle attached media: crop photos go to vision diagnosis, voice notes are
  // transcribed to text; anything else (documents, etc.) we guide the farmer on.
  let image: { buffer: Buffer; type: string; name: string } | null = null;
  let transcript = '';
  if (mediaUrl) {
    if (mediaType.startsWith('image/')) {
      try {
        image = { buffer: await downloadTwilioMedia(mediaUrl), type: mediaType, name: 'whatsapp-crop.jpg' };
      } catch (e) {
        console.error('WhatsApp media download failed:', e);
      }
    } else if (mediaType.startsWith('audio/')) {
      // Voice note: download and transcribe. Whisper reads WhatsApp's ogg/opus
      // directly and takes the farmer's language as a hint (en/hi/ta).
      try {
        const audio = await downloadTwilioMedia(mediaUrl);
        const file = new File([new Uint8Array(audio)], 'voice.ogg', { type: mediaType || 'audio/ogg' });
        transcript = (await transcribeAudio(file, locale)).trim();
      } catch (e) {
        console.error('WhatsApp voice transcription failed:', e);
        await sendWhatsApp(from, VOICE_FAILED[locale]);
        return;
      }
      if (!transcript) {
        await sendWhatsApp(from, VOICE_EMPTY[locale]);
        return;
      }
      console.log(`[WhatsApp] transcribed voice from ${farmer.name}: "${transcript.slice(0, 120)}"`);
    } else {
      await sendWhatsApp(from, NON_TEXT_MEDIA[locale]);
      return;
    }
  }

  const message = transcript || body || (image
    ? (locale === 'ta'
        ? '[பயிர் புகைப்படம்] என் பயிரை பாருங்கள்.'
        : locale === 'hi'
          ? '[फसल फोटो] मेरी फसल देखिए।'
          : '[crop photo] Please check my crop.')
    : '');
  if (!message && !image) return;

  // Short-term context: replay the last few stored turns so the bot follows the
  // thread. Long-term continuity comes from the engine's summaries + memory.
  const recent = await queryItems({
    TableName: Tables.CHAT_HISTORY,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmer.farmerId },
    ScanIndexForward: false,
    Limit: 2,
  });
  const history = recent
    .reverse()
    .flatMap((c) => (c.messages as Message[] | undefined) ?? [])
    .slice(-6);

  try {
    const result = await generateChatReply(farmer, { message, locale, history, image, addressByName: true });
    const preview = result.reply.slice(0, 200).replace(/\s+/g, ' ');
    console.log(`[WhatsApp] reply to ${farmer.name} (${farmer.phone}): ${preview}${result.reply.length > 200 ? '…' : ''}`);
    // For voice notes, echo what we understood so the farmer can catch ASR slips.
    const out = transcript ? `${heardLine(locale, transcript)}\n\n${result.reply}` : result.reply;
    await sendWhatsApp(from, out);
  } catch (e) {
    console.error('WhatsApp chat engine failed:', e);
    await sendWhatsApp(from, ERROR_REPLY[locale]);
  }
}

// A plain GET makes it easy to confirm the webhook URL is reachable in a browser.
export async function GET() {
  return new NextResponse('FarmAdvisor WhatsApp webhook is live.', { status: 200 });
}
