/**
 * Engine test for lib/pest-alert.ts against real DynamoDB. Validates the
 * broadcast write-path, getPendingAlerts/findPendingAlert, and respond('clear').
 * Uses radius 3 km (no mass WhatsApp) and cleans up after itself.
 *
 * Run:  npx tsx scripts/test-pest-engine.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  let raw = '';
  try { raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8'); }
  catch { console.error('Could not read .env.local'); return; }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(key in process.env)) process.env[key] = v;
  }
}
loadEnvLocal();
process.env.PEST_ALERT_RADIUS_KM = process.env.PEST_ALERT_RADIUS_KM || '3';

async function main() {
  const pest = await import('../lib/pest-alert');
  const { getItem, putItem, deleteItem, Tables } = await import('../lib/aws/dynamodb');
  const EESA = 'TN12346789012';

  const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: EESA });
  if (!profile) throw new Error('Eesa profile not found');

  const stamp = Date.now().toString(36);

  // 1) Auto-broadcast from a fake confirmed pest diagnosis.
  const diagnosis = {
    isPlant: true,
    healthy: false,
    diagnosis: `Test Leaf Blight ${stamp}`,
    confidence: 'high',
    cropName: 'Paddy',
    symptoms: ['brown spots'],
    cause: 'fungus',
    treatment: ['Apply recommended fungicide'],
    prevention: ['Remove and burn infected leaves', 'Spray neem oil in the evening'],
    plainSummary: 'Fungal leaf blight.',
  };
  const pestKey = pest.normalizePestKey(diagnosis);
  await pest.maybeBroadcastFromDiagnosis({ reporterId: EESA, reporterProfile: profile, diagnosis, locale: 'en' });
  const reporterRow = await getItem(Tables.PEST_ALERTS, { farmer_id: EESA, pest_key: pestKey });
  console.log(`1) auto-broadcast wrote reporter row : ${reporterRow ? 'OK' : 'FAIL'} (status=${reporterRow?.status})`);
  const reportId = reporterRow?.report_id ? String(reporterRow.report_id) : null;
  const report = reportId ? await getItem(Tables.PEST_REPORTS, { report_id: reportId }) : null;
  console.log(`   outbreak point recorded            : ${report ? 'OK' : 'FAIL'} (pest=${report?.pest_key})`);

  // 2) Recipient flow: seed a pending alert, read it, then respond 'clear'.
  const rKey = `test-recipient-${stamp}`;
  await putItem(Tables.PEST_ALERTS, {
    farmer_id: EESA, pest_key: rKey, status: 'pending',
    pest_label: 'Test Stem Borer', crop_name: 'Paddy', distance_km: 1.2,
    prevention: ['Drain the field for 2-3 days'],
    report_id: 'NONE', alerted_at: new Date().toISOString(),
    cooldown_until: Date.now() + 10 * 60 * 1000,
  });
  const pending = await pest.getPendingAlerts(EESA);
  console.log(`2) getPendingAlerts includes seeded   : ${pending.some((p) => p.pestKey === rKey) ? 'OK' : 'FAIL'} (count=${pending.length})`);
  const found = await pest.findPendingAlert(EESA);
  console.log(`   findPendingAlert returns pending   : ${found ? 'OK' : 'FAIL'}`);

  await pest.respondToPestAlert({ farmerId: EESA, farmerProfile: profile, pestKey: rKey, response: 'clear' });
  const after = await getItem(Tables.PEST_ALERTS, { farmer_id: EESA, pest_key: rKey });
  console.log(`3) respond('clear') updates status    : ${after?.status === 'clear' ? 'OK' : 'FAIL'} (${after?.status})`);

  // Cleanup.
  await deleteItem(Tables.PEST_ALERTS, { farmer_id: EESA, pest_key: rKey });
  await deleteItem(Tables.PEST_ALERTS, { farmer_id: EESA, pest_key: pestKey });
  if (reportId) await deleteItem(Tables.PEST_REPORTS, { report_id: reportId });
  console.log('cleanup                               : OK');
}

main().catch((e) => { console.error('engine test failed:', e); process.exit(1); });
