/**
 * Offline end-to-end test of the financial ledger: create expense/sale/loan for a
 * real farmer, list them, run the analysis, print the results, then clean up.
 *
 * Run:  npx tsx scripts/test-financial.ts [farmerId]
 */
import { readFileSync, existsSync } from 'node:fs';
import { scanItems, Tables } from '../lib/aws/dynamodb';
import { createEntry, listEntries, deleteEntry } from '../lib/money/ledger';
import { computeDeterministic, fallbackNarrative } from '../lib/money/analysis';
import type { FinancialEntry } from '../lib/money/types';

function loadEnvLocal() {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
loadEnvLocal();

async function main() {
  let farmerId = process.argv[2];
  if (!farmerId) {
    const farmers = await scanItems(Tables.FARMER_PROFILES);
    farmerId = String(farmers[0]?.farmer_id ?? '');
  }
  if (!farmerId) { console.error('No farmer id available.'); process.exit(1); }
  console.log(`Testing financial ledger for ${farmerId}\n`);

  const created: FinancialEntry[] = [];
  created.push(await createEntry(farmerId, { type: 'expense', amount: 4000, category: 'fertilizer', crop: 'Paddy' }));
  created.push(await createEntry(farmerId, { type: 'expense', amount: 2500, category: 'labour', crop: 'Paddy' }));
  // Sale below the market rate (2100 vs 2400) → underselling flag.
  created.push(await createEntry(farmerId, { type: 'sale', crop: 'Paddy', quantity: 10, unit: 'quintal', price_per_unit: 2100, market_modal_at_sale: 2400, buyer: 'Ravi Traders' }));
  created.push(await createEntry(farmerId, { type: 'loan', amount: 5000, lender: 'Co-op Bank', interest_rate: 7 }));
  console.log(`Created ${created.length} entries.`);

  const entries = await listEntries(farmerId);
  const mine = entries.filter((e) => created.some((c) => c.entry_id === e.entry_id));
  const a = computeDeterministic(mine);
  console.log('\n--- analysis (deterministic) ---');
  console.log('totalExpenses:', a.totalExpenses, '| totalRevenue:', a.totalRevenue, '| netProfit:', a.netProfit);
  console.log('byCategory   :', a.expensesByCategory.map((c) => `${c.category}=${c.amount}`).join(', '));
  console.log('perCrop      :', a.perCrop.map((c) => `${c.crop}: spent ${c.spent}, earned ${c.earned}, profit ${c.profit}`).join(' | '));
  console.log('sales        :', a.saleComparisons.map((c) => `${c.crop} ${c.pricePerQtl} vs mkt ${c.marketModal} → ${c.status} (Δ${c.deltaPerQtl}, loss ${c.lossIfBelow})`).join(' | '));
  console.log('underMarket  :', a.underMarketCount, '| estLoss:', a.estimatedLossFromUnderselling, '| suspiciousBuyers:', a.suspiciousBuyers);
  console.log('loans        : total', a.loanSummary.totalLoans, '| overBudget', a.loanSummary.overBudget, '| util%', a.loanSummary.utilizationPct);
  console.log('\n--- fallback narrative ---');
  console.log(fallbackNarrative(a));

  // Cleanup
  for (const c of created) await deleteEntry(farmerId, c.entry_id);
  console.log(`\n✓ Cleaned up ${created.length} test entries.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
