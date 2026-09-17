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

/** What complete_processed_file needs to decide which bucket pays for an image. */
export function limitsFor(plan) {
  return { freeLimit: plan.freeImages, monthlyLimit: plan.monthlyImages };
}

/** Images this user can still have sorted: free leftover + this period's leftover + top-up balance. */
export function remainingCredits(usage, plan) {
  if (!usage) return 0;
  const free = Math.max(0, plan.freeImages - (usage.free_images_used ?? 0));
  const monthly = Math.max(0, plan.monthlyImages - (usage.period_images_used ?? 0));
  return free + monthly + Math.max(0, usage.topup_balance ?? 0);
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
  return { plan, usage, limits: limitsFor(plan), credits, exhausted: credits <= 0 };
}
