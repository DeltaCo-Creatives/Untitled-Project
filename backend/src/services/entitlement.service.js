import { PLANS } from "../config/plans.js";
import { getUsage } from "../repositories/usage.repo.js";

// A paid plan only counts while it's paid for. past_due is a grace period until
// a payment provider exists to resolve it.
const PAID_STATUSES = new Set(["active", "past_due"]);

/** The plan whose limits apply right now; lapsed paid plans fall back to Free. */
export function effectivePlan(usage) {
  const plan = PLANS[usage?.plan];
  if (!plan || plan.id === "free") return PLANS.free;
  return PAID_STATUSES.has(usage.status) ? plan : PLANS.free;
}

/** What complete_processed_file_v2 needs to decide which bucket pays for a file, per kind. */
export function limitsFor(plan) {
  return {
    image: { freeLimit: plan.freeImages, monthlyLimit: plan.monthlyImages },
    document: { freeLimit: plan.freeDocuments, monthlyLimit: plan.monthlyDocuments },
  };
}

/** Free leftover + this period's leftover + top-up balance, for one kind's three buckets. */
function remainingFor(freeUsed, freeLimit, periodUsed, periodLimit, topupBalance) {
  const free = Math.max(0, freeLimit - (freeUsed ?? 0));
  const monthly = Math.max(0, periodLimit - (periodUsed ?? 0));
  return free + monthly + Math.max(0, topupBalance ?? 0);
}

/** Files this user can still have sorted, per kind: free leftover + this period's leftover + top-up balance. */
export function remainingCredits(usage, plan) {
  if (!usage) return { image: 0, document: 0 };
  return {
    image: remainingFor(usage.free_images_used, plan.freeImages, usage.period_images_used, plan.monthlyImages, usage.topup_balance),
    document: remainingFor(
      usage.free_documents_used,
      plan.freeDocuments,
      usage.period_documents_used,
      plan.monthlyDocuments,
      usage.document_topup_balance,
    ),
  };
}

/**
 * Marks which processes the plan covers. Oldest processes win, so reordering
 * or renaming never changes which ones run after a downgrade. A locked process
 * can be edited or deleted but doesn't run.
 */
export function rankProcesses(processes, plan) {
  return [...processes]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))
    .map((process, index) => {
      const locked = index >= plan.maxProcesses;
      return { ...process, locked, active: Boolean(process.enabled) && !locked };
    });
}

/** Plan, usage and remaining credits for one user, or null when they have no subscription row (fail closed). */
export async function loadEntitlement(userId) {
  const usage = await getUsage(userId);
  if (!usage) return null;

  const plan = effectivePlan(usage);
  const credits = remainingCredits(usage, plan);
  // Exhausted only when neither kind can sort anything; a process of the other kind still runs.
  return { plan, usage, limits: limitsFor(plan), credits, exhausted: credits.image <= 0 && credits.document <= 0 };
}
