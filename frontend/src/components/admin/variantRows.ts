import type { PlansResponse } from '../../lib/api';
import { packLabel } from '../billing/planFeatures';

export interface VariantRow {
  /** What the owner must name the Lemon Squeezy variant. */
  id: string;
  /** Human name for the row, e.g. "Images · Creator (yearly)". */
  label: string;
  price: number;
}

/**
 * One row per purchasable thing — every paid plan (monthly, plus yearly where a yearly price
 * exists) and every top-up/document pack — derived entirely from `GET /api/plans`. Never hard-code
 * plan names, prices or ids here: if the plan catalog changes, this list changes with it. Free is
 * skipped; it's never purchasable.
 */
export function variantRows(plans: PlansResponse): VariantRow[] {
  const familyLabel = (familyId: string) => plans.families.find((family) => family.id === familyId)?.label ?? familyId;

  const rows: VariantRow[] = [];
  for (const plan of plans.plans) {
    if (plan.family === 'free') continue;
    rows.push({ id: plan.id, label: `${familyLabel(plan.family)} · ${plan.label}`, price: plan.price.monthly });
    if (plan.billing.includes('yearly') && plan.price.yearly != null) {
      rows.push({
        id: `${plan.id}-yearly`,
        label: `${familyLabel(plan.family)} · ${plan.label} (yearly)`,
        price: plan.price.yearly,
      });
    }
  }
  for (const pack of plans.topupPacks) {
    rows.push({ id: pack.id, label: `${packLabel(pack.images)} pack`, price: pack.price });
  }
  for (const pack of plans.documentPacks) {
    rows.push({ id: pack.id, label: `${packLabel(pack.documents, 'document')} pack`, price: pack.price });
  }
  return rows;
}
