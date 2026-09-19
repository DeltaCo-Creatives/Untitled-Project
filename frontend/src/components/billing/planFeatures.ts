import type { CurrentPlan, KindUsage, PlanFamilyId, PlanInfo, PlansResponse, Usage } from '../../lib/api';
import { formatCount, formatDate, plural } from '../../lib/format';

/** Used before /api/plans answers (or if it can't), so marketing copy never shows a blank. */
export const DEFAULT_FREE_IMAGES = 100;
export const DEFAULT_FREE_DOCUMENTS = 25;

/** Tooltip and helper copy for every purchase button while checkout isn't wired up yet. */
export const PAYMENTS_PENDING_NOTE = 'Payments launch soon. This will be purchasable then.';

/** A plan family other than Free — the only choices the family picker offers. */
export type FamilyChoice = Exclude<PlanFamilyId, 'free'>;

export function isFamilyChoice(value: string | null | undefined): value is FamilyChoice {
  return value === 'images' || value === 'documents' || value === 'complete';
}

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

/** Same shape as {@link imagesFeature}, for documents. */
export function documentsFeature(plan: Pick<PlanInfo, 'freeDocuments' | 'monthlyDocuments'>) {
  if (plan.monthlyDocuments > 0) return `${formatCount(plan.monthlyDocuments)} documents every month`;
  return `${formatCount(plan.freeDocuments)} documents, no time limit`;
}

/** Only the allowances a plan actually includes — Free has both; a single-kind plan shows just its one kind. */
export function allowanceFeatures(
  plan: Pick<PlanInfo, 'freeImages' | 'monthlyImages' | 'freeDocuments' | 'monthlyDocuments'>,
): string[] {
  const features: string[] = [];
  if (plan.freeImages > 0 || plan.monthlyImages > 0) features.push(imagesFeature(plan));
  if (plan.freeDocuments > 0 || plan.monthlyDocuments > 0) features.push(documentsFeature(plan));
  return features;
}

/** Feature bullets for a plan card. `compact` drops the trailing "custom destinations" line. */
export function planFeatures(plan: PlanInfo, { compact = false }: { compact?: boolean } = {}): string[] {
  const features = [processesFeature(plan), aiWorkersFeature(plan), ...allowanceFeatures(plan)];
  if (!compact) features.push('Custom destinations, naming and tags');
  return features;
}

/** "250 images" / "250 documents" */
export function packLabel(count: number, unit: string = 'image') {
  return `${formatCount(count)} ${unit}${count === 1 ? '' : 's'}`;
}

/** The Free plan's lifetime image allowance from the plans payload, with a sensible default. */
export function freeImageAllowance(plans: PlansResponse | null) {
  return plans?.plans.find(isFreePlan)?.freeImages ?? DEFAULT_FREE_IMAGES;
}

/** The Free plan's lifetime document allowance from the plans payload, with a sensible default. */
export function freeDocumentAllowance(plans: PlansResponse | null) {
  return plans?.plans.find(isFreePlan)?.freeDocuments ?? DEFAULT_FREE_DOCUMENTS;
}

const FAMILY_TIER_ORDER: Record<string, number> = { creator: 0, studio: 1, enterprise: 2 };

/** Free plus the given family's tiers, in Creator → Studio → Enterprise order. */
export function plansForFamily(plans: PlanInfo[], family: FamilyChoice): PlanInfo[] {
  const free = plans.find(isFreePlan) ?? null;
  const tierPlans = [...plans.filter((plan) => plan.family === family)].sort(
    (a, b) => (FAMILY_TIER_ORDER[a.tier] ?? 0) - (FAMILY_TIER_ORDER[b.tier] ?? 0),
  );
  return free ? [free, ...tierPlans] : tierPlans;
}

/**
 * For an Images + Documents plan, how much cheaper it is per month than buying the same tier's Images and
 * Documents plans separately. Null unless the saving is actually positive — never a fake percentage.
 */
export function bundleSavings(allPlans: PlanInfo[], completePlan: PlanInfo, currency: string): string | null {
  if (completePlan.family !== 'complete') return null;
  const images = allPlans.find((plan) => plan.family === 'images' && plan.tier === completePlan.tier);
  const documents = allPlans.find((plan) => plan.family === 'documents' && plan.tier === completePlan.tier);
  if (!images || !documents) return null;
  const saving = images.price.monthly + documents.price.monthly - completePlan.price.monthly;
  if (saving <= 0) return null;
  return `Save ${formatPrice(saving, currency)}/month vs buying both`;
}

const FAMILY_LABELS: Record<FamilyChoice, string> = {
  images: 'Images',
  documents: 'Documents',
  complete: 'Images + Documents',
};

/** "Creator · Images + Documents · 5 work processes · 3 AI per process" */
export function planSummaryLine(plan: CurrentPlan): string {
  const parts = [plan.label];
  if (isFamilyChoice(plan.family)) parts.push(FAMILY_LABELS[plan.family]);
  parts.push(plural(plan.maxProcesses, 'work process', 'work processes'));
  parts.push(`${plan.aiPerProcess} AI per process`);
  return parts.join(' · ');
}

export type UsageKind = 'images' | 'documents';

/** The allowance that actually applies right now: this billing period for paid plans, lifetime for Free. */
export function kindLimit(plan: CurrentPlan, usage: Usage, kind: UsageKind): number {
  const free = plan.id === 'free';
  const planFree = kind === 'images' ? plan.freeImages : plan.freeDocuments;
  const planMonthly = kind === 'images' ? plan.monthlyImages : plan.monthlyDocuments;
  const kindUsage = usage[kind];
  return free ? kindUsage.freeLimit || planFree : kindUsage.periodLimit || planMonthly;
}

/** Whether the plan (or a leftover pack) gives any access at all to this kind. */
export function kindIncluded(plan: CurrentPlan, usage: Usage, kind: UsageKind): boolean {
  return kindLimit(plan, usage, kind) > 0 || usage[kind].topupBalance > 0;
}

/** True when a kind the plan actually includes has run out — never true for a kind that was never included. */
export function anyKindExhausted(plan: CurrentPlan, usage: Usage): boolean {
  return (['images', 'documents'] as UsageKind[]).some((kind) => kindIncluded(plan, usage, kind) && usage[kind].exhausted);
}

/** One line describing where the user stands on one kind, for meters and quiet lines. */
export function kindUsageSummary(
  kindUsage: KindUsage,
  isFree: boolean,
  words: { one: string; many: string },
  periodResetsAt: string | null,
): string {
  if (kindUsage.exhausted) {
    return isFree
      ? `You’ve used all ${formatCount(kindUsage.freeLimit)} free ${words.many}. Upgrade or add a ${words.one} pack to keep sorting.`
      : `You’ve used this period’s ${words.many}. They refill ${periodResetsAt ? formatDate(periodResetsAt) : 'soon'}, or add a ${words.one} pack.`;
  }
  const extra =
    kindUsage.topupBalance > 0 ? ` (including ${plural(kindUsage.topupBalance, `pack ${words.one}`, `pack ${words.many}`)})` : '';
  return `${plural(kindUsage.remaining, words.one, words.many)} left${extra}.`;
}
