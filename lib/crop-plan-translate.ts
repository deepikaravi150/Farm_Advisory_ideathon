import { chatWithBedrock } from './ai/openai';
import { updateItem, Tables } from './aws/dynamodb';
import type { Milestone } from './types/crop-plan';

export type PlanLocale = 'en' | 'hi' | 'ta';

const LANG_NAME: Record<PlanLocale, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil' };

interface TranslatableMilestone {
  id: string;
  label?: string;
  summary?: string;
  tasks?: string;
  weatherRequirement?: string;
  alertAdvice?: string;
}

interface TranslatablePlanFields {
  cropName: string;
  sellWindow?: string;
  storageNotes?: string;
  milestones: TranslatableMilestone[];
}

async function translatePlanFields(
  fields: TranslatablePlanFields,
  targetLocale: PlanLocale
): Promise<TranslatablePlanFields | null> {
  const prompt = `Translate the farmer-facing text values in this crop plan JSON into ${LANG_NAME[targetLocale]}.
Translate only: cropName, sellWindow, storageNotes, and each milestone's label/summary/tasks/weatherRequirement/alertAdvice.
Keep every "id" value exactly as given. Do not add, remove, or reorder milestones. Keep meaning and level of detail the same — this is a translation, not a rewrite.

Input JSON:
${JSON.stringify(fields)}

Return only the translated JSON object, same shape as the input.`;

  try {
    const res = await chatWithBedrock(
      [{ role: 'user', content: prompt }],
      `You are a precise agricultural translator for Tamil Nadu farmers. Return one valid JSON object only, in the exact same shape as the input, with farmer-facing text translated to ${LANG_NAME[targetLocale]}.`,
      { json: true, maxTokens: 4000 }
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(res);
    } catch {
      const m = res.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as TranslatablePlanFields).milestones)) return null;
    return parsed as TranslatablePlanFields;
  } catch (err) {
    console.error('Crop plan translation failed:', err);
    return null;
  }
}

/**
 * Ensures a stored plan's farmer-facing text is in `targetLocale`. Plans are
 * generated once in whatever language the farmer had selected then (recorded as
 * `content_locale`); switching the UI language later doesn't retroactively change
 * that saved text. This translates on first view after a language switch and
 * caches the result on the plan item (`translations.<locale>`) so later views for
 * the same plan+locale are free.
 */
export async function localizePlan(
  plan: Record<string, unknown>,
  targetLocale: PlanLocale
): Promise<Record<string, unknown>> {
  const sourceLocale = ((plan.content_locale as PlanLocale) ?? 'en') as PlanLocale;
  if (sourceLocale === targetLocale) return plan;

  const cache = (plan.translations as Record<string, TranslatablePlanFields> | undefined) ?? {};
  let translated = cache[targetLocale];

  if (!translated) {
    const milestones = ((plan.milestones as Milestone[]) ?? []).map((m) => ({
      id: m.id,
      label: m.label,
      summary: m.summary,
      tasks: m.tasks,
      weatherRequirement: m.weatherRequirement,
      alertAdvice: m.alertAdvice,
    }));
    const fields: TranslatablePlanFields = {
      cropName: String(plan.crop_name ?? ''),
      sellWindow: plan.sell_window ? String(plan.sell_window) : undefined,
      storageNotes: plan.storage_notes ? String(plan.storage_notes) : undefined,
      milestones,
    };
    const result = await translatePlanFields(fields, targetLocale);
    if (!result) return plan; // translation failed — show source-language content rather than erroring out
    translated = result;

    // Best-effort cache write; a failure here just means we re-translate next time.
    // DynamoDB rejects SET-ing a path and a sub-path of it in one expression (e.g.
    // `translations` and `translations.hi` together), so branch on whether the
    // map already exists rather than using an if_not_exists(...) + nested-set combo.
    if (plan.farmer_id && plan.plan_id) {
      try {
        const hasMap = plan.translations && typeof plan.translations === 'object';
        await updateItem({
          TableName: Tables.CROP_PLANS,
          Key: { farmer_id: plan.farmer_id, plan_id: plan.plan_id },
          UpdateExpression: hasMap ? 'SET translations.#loc = :t' : 'SET translations = :map',
          ExpressionAttributeNames: hasMap ? { '#loc': targetLocale } : undefined,
          ExpressionAttributeValues: hasMap ? { ':t': translated } : { ':map': { [targetLocale]: translated } },
        });
      } catch (err) {
        console.error('Crop plan translation cache write failed:', err);
      }
    }
  }

  const milestonesById = new Map((translated.milestones ?? []).map((m) => [m.id, m]));
  return {
    ...plan,
    crop_name: translated.cropName || plan.crop_name,
    sell_window: translated.sellWindow ?? plan.sell_window,
    storage_notes: translated.storageNotes ?? plan.storage_notes,
    milestones: ((plan.milestones as Milestone[]) ?? []).map((m) => {
      const t = milestonesById.get(m.id);
      if (!t) return m;
      return {
        ...m,
        label: t.label ?? m.label,
        summary: t.summary ?? m.summary,
        tasks: t.tasks ?? m.tasks,
        weatherRequirement: t.weatherRequirement ?? m.weatherRequirement,
        alertAdvice: t.alertAdvice ?? m.alertAdvice,
      };
    }),
  };
}

export async function localizePlans(
  plans: Record<string, unknown>[],
  targetLocale: PlanLocale
): Promise<Record<string, unknown>[]> {
  return Promise.all(plans.map((p) => localizePlan(p, targetLocale)));
}
