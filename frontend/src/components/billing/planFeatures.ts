import type { BillingInterval, PlanId, PlanInfo, PlansResponse, TopupPack } from '../../lib/api';
import { formatCount, plural } from '../../lib/format';

/** The plan that wears the "Most popular" ribbon. */
export const FEATURED_PLAN_ID: PlanId = 'studio';

/** Used before /api/plans answers (or if it can't), so marketing copy never shows a blank. */
export const DEFAULT_FREE_IMAGES = 100;

/** Tooltip and helper copy for every purchase button until a payment provider is integrated. */
export const PAYMENTS_PENDING_NOTE = 'Payments launch soon. Paid plans and image packs open up then.';

export function isFreePlan(plan: Pick<PlanInfo, 'id'>) {
  return plan.id === 'free';
}

/** "Free" for the free plan; otherwise the price, or "Coming soon" until payments launch. */
export function priceText(plan: Pick<PlanInfo, 'id' | 'priceLabel'>) {
  if (plan.priceLabel) return plan.priceLabel;
  return isFreePlan(plan) ? 'Free' : 'Coming soon';
}

/** "1 AI work process" / "15 AI work processes" */
export function processesFeature(plan: Pick<PlanInfo, 'maxProcesses'>) {
  return plural(plan.maxProcesses, 'AI work process', 'AI work processes');
}

/** "100 images, no time limit" for Free; "5,000 images every month" for paid plans. */
export function imagesFeature(plan: Pick<PlanInfo, 'freeImages' | 'monthlyImages'>) {
  if (plan.monthlyImages > 0) return `${formatCount(plan.monthlyImages)} images every month`;
  return `${formatCount(plan.freeImages)} images, no time limit`;
}

export function supportsInterval(plan: Pick<PlanInfo, 'billing'>, interval: BillingInterval) {
  return plan.billing.includes(interval);
}

/** True when at least one plan can be billed yearly, i.e. the Monthly/Yearly toggle means something. */
export function offersYearly(plans: Pick<PlanInfo, 'billing'>[]) {
  return plans.some((plan) => supportsInterval(plan, 'yearly'));
}

export interface BillingNote {
  text: string;
  /** The plan can't be billed the way the toggle says; worth a highlight. */
  emphasis: boolean;
}

/** The small line under the price. It follows the Monthly/Yearly toggle. */
export function billingNote(plan: Pick<PlanInfo, 'id' | 'billing'>, interval: BillingInterval): BillingNote {
  if (isFreePlan(plan) || plan.billing.length === 0) return { text: 'No credit card needed', emphasis: false };
  if (!supportsInterval(plan, 'yearly')) return { text: 'Monthly billing only', emphasis: interval === 'yearly' };
  if (!supportsInterval(plan, 'monthly')) return { text: 'Yearly billing only', emphasis: interval === 'monthly' };
  return { text: interval === 'yearly' ? 'Billed yearly' : 'Billed monthly', emphasis: false };
}

/** Feature bullets for a plan card. `compact` keeps the three that matter most. */
export function planFeatures(plan: PlanInfo, { compact = false }: { compact?: boolean } = {}): string[] {
  const features = [processesFeature(plan), imagesFeature(plan), 'Custom destinations, naming and tags'];
  if (!compact) features.push('Image packs available');
  return features;
}

/** "250 images" */
export function packLabel(pack: Pick<TopupPack, 'images'>) {
  return `${formatCount(pack.images)} images`;
}

/** The Free plan's lifetime allowance from the plans payload, with a sensible default. */
export function freeImageAllowance(plans: PlansResponse | null) {
  return plans?.plans.find(isFreePlan)?.freeImages ?? DEFAULT_FREE_IMAGES;
}
