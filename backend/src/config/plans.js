/**
 * Every plan limit and price lives here and only here. The SQL functions receive
 * the allowances as arguments (see supabase/migrations/0002_work_processes.sql),
 * the pipeline reads aiPerProcess, and the frontend renders GET /api/plans, so
 * changing a number is a one-line edit plus a backend deploy.
 *
 * Prices are USD placeholders shown on the website. No payment provider is
 * integrated yet, so the UI shows each price with a "Coming soon" button.
 */
export const CURRENCY = "USD";

export const PLANS = {
  free: {
    id: "free",
    label: "Free",
    tagline: "Try DriveTag on your own Drive, no time limit.",
    maxProcesses: 1,
    aiPerProcess: 1, // AI workers sorting one process's Raw folder at the same time
    freeImages: 100, // lifetime, not monthly
    monthlyImages: 0,
    billing: [],
    price: { monthly: 0, yearly: null },
    popular: false,
  },
  creator: {
    id: "creator",
    label: "Creator",
    tagline: "For freelancers juggling a few clients.",
    maxProcesses: 5,
    aiPerProcess: 3,
    freeImages: 0,
    monthlyImages: 1000,
    billing: ["monthly", "yearly"],
    price: { monthly: 9.99, yearly: 99.9 }, // yearly = 2 months free
    popular: false,
  },
  studio: {
    id: "studio",
    label: "Studio",
    tagline: "For agencies sorting for many clients at once.",
    maxProcesses: 15,
    aiPerProcess: 5,
    freeImages: 0,
    monthlyImages: 5000,
    billing: ["monthly", "yearly"],
    price: { monthly: 29.99, yearly: 299.9 },
    popular: true,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    tagline: "High-volume teams with dozens of pipelines.",
    maxProcesses: 50,
    aiPerProcess: 15,
    freeImages: 0,
    monthlyImages: 25000,
    billing: ["monthly"], // monthly only, by decision
    price: { monthly: 99.99, yearly: null },
    popular: false,
  },
};

export const PLAN_ORDER = ["free", "creator", "studio", "enterprise"];

/** One-time image packs. Anyone can buy them; they never expire and are used after the plan's allowance. */
export const TOPUP_PACKS = [
  { id: "pack-250", images: 250, price: 4.99 },
  { id: "pack-1000", images: 1000, price: 14.99 },
  { id: "pack-5000", images: 5000, price: 49.99 },
];

/**
 * Document sorting (PDF, Word, Google Docs, text) — priced here so the website can
 * show it, but NOT built yet: available stays false and every price renders as a
 * preview. Documents get their own allowance instead of a credit multiplier, so a
 * customer always knows what one upload costs them.
 *
 * Cost control, which is what lets these prices stay generous:
 * - the AI reads at most the first `pagesRead` pages (or the equivalent text), so a
 *   500-page PDF costs the same as a 5-page one;
 * - files over `maxFileMb` are skipped before any AI call, and never charged;
 * - allowances stop at zero (no overage billing), exactly like images.
 */
export const DOCUMENTS = {
  available: false,
  pagesRead: 5,
  maxFileMb: 20,
  freeDocuments: 25, // lifetime, on the Free plan
  // Added to an image plan. Uses that plan's process slots and AI workers.
  addons: {
    creator: { monthlyDocuments: 300, price: { monthly: 4.99, yearly: 49.9 } },
    studio: { monthlyDocuments: 1000, price: { monthly: 14.99, yearly: 149.9 } },
    enterprise: { monthlyDocuments: 3000, price: { monthly: 39.99, yearly: null } },
  },
  // For teams that only sort documents.
  plans: [
    {
      id: "docs-starter",
      label: "Docs Starter",
      tagline: "Invoices, contracts and briefs for a small team.",
      maxProcesses: 3,
      aiPerProcess: 3,
      monthlyDocuments: 500,
      billing: ["monthly", "yearly"],
      price: { monthly: 7.99, yearly: 79.9 },
    },
    {
      id: "docs-pro",
      label: "Docs Pro",
      tagline: "Busy studios filing paperwork for many clients.",
      maxProcesses: 10,
      aiPerProcess: 5,
      monthlyDocuments: 2000,
      billing: ["monthly", "yearly"],
      price: { monthly: 24.99, yearly: 249.9 },
    },
    {
      id: "docs-business",
      label: "Docs Business",
      tagline: "High-volume back offices.",
      maxProcesses: 30,
      aiPerProcess: 15,
      monthlyDocuments: 7500,
      billing: ["monthly"],
      price: { monthly: 79.99, yearly: null },
    },
  ],
  packs: [
    { id: "docs-pack-250", documents: 250, price: 5.99 },
    { id: "docs-pack-1000", documents: 1000, price: 19.99 },
  ],
};

/** Per-process editing limits, enforced by utils/processValidation.js and mirrored in the editor UI. */
export const PROCESS_LIMITS = {
  maxDestinations: 20, // not counting Unsorted; keeps the AI's destination enum small and accurate
  maxTagFields: 10,
  nameMax: 60,
  descriptionMax: 300,
  instructionsMax: 1000,
  tagLabelMax: 40,
  tagDescriptionMax: 200,
  templateMax: 200,
};

export function publicPlansPayload() {
  return {
    currency: CURRENCY,
    plans: PLAN_ORDER.map((id) => ({ ...PLANS[id] })),
    topupPacks: TOPUP_PACKS.map((pack) => ({ ...pack })),
    documents: structuredClone(DOCUMENTS),
    processLimits: { ...PROCESS_LIMITS },
  };
}
