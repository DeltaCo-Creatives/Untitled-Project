import type { PlanInfo, PlansResponse, TopupPack } from '../../lib/api';
import { formatCount, plural } from '../../lib/format';

/** Used before /api/plans answers (or if it can't), so marketing copy never shows a blank. */
export const DEFAULT_FREE_IMAGES = 100;

/** Tooltip and helper copy for every purchase button while checkout isn't wired up yet. */
export const PAYMENTS_PENDING_NOTE = 'Payments launch soon. This will be purchasable then.';

export function isFreePlan(plan: Pick<PlanInfo, 'id'>) {
  return plan.id === 'free';
}

/** `9.99` + `"USD"` → `"$9.99"`. Zero renders without decimals: `"$0"`. */
export function formatPrice(amount: number, currency: string) {
  const digits = amount === 0 ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

/** How many months a yearly price saves versus paying monthly, rounded to the nearest integer, floored at 0. */
export function monthsFree(monthly: number, yearly: number) {
  if (monthly <= 0) return 0;
  return Math.max(0, Math.round(12 - yearly / monthly));
}

/** A per-unit price for a pack — cents when that reads better ("2¢ per image"), otherwise full currency. */
export function perUnitPrice(price: number, units: number, unitLabel: string, currency: string) {
  if (units <= 0) return null;
  const unit = price / units;
  if (currency === 'USD' && unit < 1) return `${Math.max(1, Math.round(unit * 100))}¢ per ${unitLabel}`;
  return `${formatPrice(unit, currency)} per ${unitLabel}`;
}

/** "1 AI work process" / "15 AI work processes" */
export function processesFeature(plan: Pick<PlanInfo, 'maxProcesses'>) {
  return plural(plan.maxProcesses, 'AI work process', 'AI work processes');
}

/** "1 AI worker sorting at a time" / "3 AI workers sorting each process at once" */
export function aiWorkersFeature(plan: Pick<PlanInfo, 'aiPerProcess'>) {
  return plan.aiPerProcess === 1
    ? '1 AI worker sorting at a time'
    : `${plan.aiPerProcess} AI workers sorting each process at once`;
}

/** "100 images, no time limit" for Free; "5,000 images every month" for paid plans. */
export function imagesFeature(plan: Pick<PlanInfo, 'freeImages' | 'monthlyImages'>) {
  if (plan.monthlyImages > 0) return `${formatCount(plan.monthlyImages)} images every month`;
  return `${formatCount(plan.freeImages)} images, no time limit`;
}

/** Feature bullets for a plan card. `compact` keeps the three that matter most. */
export function planFeatures(plan: PlanInfo, { compact = false }: { compact?: boolean } = {}): string[] {
  const features = [processesFeature(plan), aiWorkersFeature(plan), imagesFeature(plan)];
  if (!compact) features.push('Custom destinations, naming and tags');
  return features;
}

/** "250 images" / "250 documents" */
export function packLabel(pack: Pick<TopupPack, 'images'>, unit: string = 'image') {
  return `${formatCount(pack.images)} ${unit}${pack.images === 1 ? '' : 's'}`;
}

/** The Free plan's lifetime allowance from the plans payload, with a sensible default. */
export function freeImageAllowance(plans: PlansResponse | null) {
  return plans?.plans.find(isFreePlan)?.freeImages ?? DEFAULT_FREE_IMAGES;
}
