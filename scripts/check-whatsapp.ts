/**
 * Read-only WhatsApp wiring check.
 *
 * Confirms a phone number maps to a registered farmer — the same lookup the
 * /api/whatsapp webhook uses — and shows the name the bot would address them by.
 * Does NOT call the LLM and writes nothing.
 *
 * Run:  npx tsx scripts/check-whatsapp.ts                  # list registered farmers
 *       npx tsx scripts/check-whatsapp.ts +919876543210    # check one number
 *       npx tsx scripts/check-whatsapp.ts whatsapp:+919876543210
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Populate process.env from .env.local before any AWS client is constructed.
function loadEnvLocal() {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
  } catch {
    console.error('Could not read .env.local — run this from the project root.');
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

async function main() {
  // Imported after env is loaded (relative paths so no build/alias needed).
  const { queryItems, scanItems, Tables } = await import('../lib/aws/dynamodb');
  const { toTenDigitPhone } = await import('../lib/phone');

  async function findByPhone(phone: string) {
    try {
      return await queryItems({
        TableName: Tables.FARMER_PROFILES,
        IndexName: 'phone-index',
        KeyConditionExpression: 'phone = :phone',
        ExpressionAttributeValues: { ':phone': phone },
      });
    } catch {
      const all = await scanItems(Tables.FARMER_PROFILES);
      return all.filter((f) => f.phone === phone);
    }
  }

  const arg = process.argv[2];

  if (arg) {
    // Mimic exactly what the webhook does with Twilio's `From` field.
    const phone = toTenDigitPhone(arg.replace('whatsapp:', ''));
    console.log(`\nInput: ${arg}  ->  normalized 10-digit: ${phone}\n`);

    const matches = await findByPhone(phone);
    if (!matches.length) {
      console.log('❌ NOT connected — no registered farmer has this number.');
      console.log('   The bot would reply with the sign-up prompt.');
    } else {
      const f = matches[0];
      console.log('✅ Connected to a registered user:');
      console.log(`   Name      : ${f.name}`);
      console.log(`   Phone     : ${f.phone}`);
      console.log(`   Farmer ID : ${f.farmer_id}`);
      console.log(`   Language  : ${f.preferred_language ?? 'en'}`);
      console.log(`\n   The bot will greet them as "${String(f.name ?? '').split(/\s+/)[0]}".`);
    }
    return;
  }

  // No arg: list everyone so you can confirm your test number is registered.
  const all = await scanItems(Tables.FARMER_PROFILES);
  console.log(`\n${all.length} registered farmer(s):\n`);
  for (const f of all) {
    console.log(`  ${String(f.name ?? '(no name)').padEnd(22)}  ${f.phone}   [${f.preferred_language ?? 'en'}]  ${f.farmer_id}`);
  }
  console.log('\nTip: pass a number to simulate the webhook lookup, e.g.');
  console.log('  npx tsx scripts/check-whatsapp.ts +919876543210\n');
}

main().catch((e) => {
  console.error('check failed:', e);
  process.exit(1);
});
