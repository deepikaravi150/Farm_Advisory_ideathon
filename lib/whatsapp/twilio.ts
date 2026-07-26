import crypto from 'crypto';

// Twilio WhatsApp (sandbox or production) configuration.
//   TWILIO_ACCOUNT_SID    - "ACxxxxxxxx"
//   TWILIO_AUTH_TOKEN     - account auth token (also used to download media)
//   TWILIO_WHATSAPP_FROM  - the sender, e.g. "whatsapp:+14155238886" (sandbox number)
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? '';
const FROM = process.env.TWILIO_WHATSAPP_FROM ?? '';

// A single WhatsApp message body is capped at 1600 chars; stay safely under it.
const MAX_BODY = 1500;

/**
 * Convert the model's Markdown into WhatsApp's lightweight markup so farmers
 * don't see stray formatting characters. WhatsApp bold is a *single* asterisk
 * (not Markdown's **double**), italic is _underscores_, and there are no #
 * headings — so Markdown leaks through as literal `*`, `#`, etc. if not mapped.
 */
export function formatForWhatsApp(text: string): string {
  return text
    // # / ## / ### headings -> bold line (WhatsApp has no headings)
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm, '*$1*')
    // **bold** and __bold__ -> *bold*
    .replace(/\*\*([^\n]+?)\*\*/g, '*$1*')
    .replace(/__([^\n]+?)__/g, '*$1*')
    // "* item" bullets -> "- item" so the leading * isn't read as bold
    .replace(/^([ \t]*)\*[ \t]+/gm, '$1- ')
    // [text](url) -> text (url)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .trim();
}

export function isTwilioConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && FROM);
}

/**
 * Build the "join the sandbox" deep link used during registration. The link is
 * the same for every farmer: opening it pre-fills "join <keyword>" in WhatsApp to
 * the sandbox number, which opts them in. Number comes from TWILIO_WHATSAPP_FROM,
 * keyword from TWILIO_SANDBOX_KEYWORD (set this to your sandbox's join word).
 */
export function getSandboxJoinInfo(): { number: string; keyword: string; link: string } {
  const number = FROM.replace(/^whatsapp:/, '').replace(/\D/g, ''); // e.g. "14155238886"
  const keyword = process.env.TWILIO_SANDBOX_KEYWORD ?? '';
  const text = keyword ? `join ${keyword}` : 'join';
  const link = number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : '';
  return { number, keyword, link };
}

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
}

/** Split a long reply into WhatsApp-sized chunks, preferring paragraph/line breaks. */
function chunkBody(text: string): string[] {
  if (text.length <= MAX_BODY) return [text];
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > MAX_BODY) {
    let cut = remaining.lastIndexOf('\n', MAX_BODY);
    if (cut < MAX_BODY * 0.6) cut = remaining.lastIndexOf(' ', MAX_BODY);
    if (cut < MAX_BODY * 0.6) cut = MAX_BODY;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** Send a WhatsApp text reply via Twilio's REST API (async, no webhook timeout). */
export async function sendWhatsApp(to: string, body: string): Promise<void> {
  if (!isTwilioConfigured()) {
    console.error('Twilio not configured — set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM');
    return;
  }
  const toAddr = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;

  for (const part of chunkBody(formatForWhatsApp(body))) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: FROM, To: toAddr, Body: part }),
    });
    if (!res.ok) {
      console.error('Twilio send failed:', res.status, await res.text().catch(() => ''));
      break;
    }
  }
}

/** Download inbound media (e.g. a crop photo) from a Twilio MediaUrl. Requires auth. */
export async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  const res = await fetch(mediaUrl, { headers: { Authorization: authHeader() } });
  if (!res.ok) throw new Error(`Twilio media download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Validate the X-Twilio-Signature header so only genuine Twilio webhooks are
 * processed. `url` must be the exact public URL Twilio called (configure it via
 * WHATSAPP_WEBHOOK_URL since proxies/ngrok rewrite the host). Off by default —
 * enable with TWILIO_VALIDATE_SIGNATURE=true once your public URL is stable.
 */
export function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature || !AUTH_TOKEN) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = crypto.createHmac('sha1', AUTH_TOKEN).update(Buffer.from(data, 'utf-8')).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
