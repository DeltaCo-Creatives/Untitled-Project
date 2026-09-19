/**
 * Every plan limit and price lives here and only here. The SQL functions receive
 * the allowances as arguments (see supabase/migrations/0002 and 0004), the pipeline
 * reads aiPerProcess and the file limits, and the frontend renders GET /api/plans,
 * so changing a number is a one-line edit plus a backend deploy. Adding or renaming
 * a plan id also needs the subscriptions_plan_check constraint updated (0004).
 *
 * Plans come in three families that share the same three tiers: Images only,
 * Documents only, and Images + Documents. A tier fixes the scale (work processes,
 * AI workers per process); the family fixes which monthly allowances you get.
 * Any plan can run either kind of process and buy either kind of pack.
 *
 * Prices are USD placeholders shown on the website. No payment provider is
 * integrated yet, so the UI shows each price with a "Coming soon" button.
 */
export const CURRENCY = "USD";

export const FAMILIES = [
  { id: "images", label: "Images", description: "Photos, logos and graphics, tagged and sorted." },
  { id: "documents", label: "Documents", description: "PDFs, Word files and Google Docs, named and filed." },
  { id: "complete", label: "Images + Documents", description: "Both, for less than buying them separately." },
];

// Scale shared by every family's tier of the same name.
const TIERS = {
  creator: { label: "Creator", maxProcesses: 5, aiPerProcess: 3 },
  studio: { label: "Studio", maxProcesses: 15, aiPerProcess: 5 },
  enterprise: { label: "Enterprise", maxProcesses: 50, aiPerProcess: 15 },
};

function plan(id, family, tier, { tagline, monthlyImages = 0, monthlyDocuments = 0, price, popular = false }) {
  return {
    id,
    family,
    tier,
    label: TIERS[tier].label,
    tagline,
    maxProcesses: TIERS[tier].maxProcesses,
    aiPerProcess: TIERS[tier].aiPerProcess, // AI workers sorting one process's Raw folder at the same time
    freeImages: 0,
    freeDocuments: 0,
    monthlyImages,
    monthlyDocuments,
    // Enterprise tiers are billed monthly only, by decision; the others offer yearly at 2 months free.
    billing: price.yearly ? ["monthly", "yearly"] : ["monthly"],
    price,
    popular,
  };
}

export const PLANS = {
  free: {
    id: "free",
    family: "free",
    tier: "free",
    label: "Free",
    tagline: "Try DriveTag on your own Drive, no time limit.",
    maxProcesses: 1,
    aiPerProcess: 1,
    freeImages: 100, // lifetime, not monthly
    freeDocuments: 25, // lifetime, not monthly
    monthlyImages: 0,
    monthlyDocuments: 0,
    billing: [],
    price: { monthly: 0, yearly: null },
    popular: false,
  },

  // Images only. These ids predate the families and are stored in subscriptions.plan — never rename them.
  creator: plan("creator", "images", "creator", {
    tagline: "For freelancers juggling a few clients.",
    monthlyImages: 1000,
    price: { monthly: 9.99, yearly: 99.9 },
  }),
  studio: plan("studio", "images", "studio", {
    tagline: "For agencies sorting for many clients at once.",
    monthlyImages: 5000,
    price: { monthly: 29.99, yearly: 299.9 },
    popular: true,
  }),
  enterprise: plan("enterprise", "images", "enterprise", {
    tagline: "High-volume teams with dozens of pipelines.",
    monthlyImages: 25000,
    price: { monthly: 99.99, yearly: null },
  }),

  // Documents only.
  "docs-creator": plan("docs-creator", "documents", "creator", {
    tagline: "Invoices, contracts and briefs for a small team.",
    monthlyDocuments: 500,
    price: { monthly: 7.99, yearly: 79.9 },
  }),
  "docs-studio": plan("docs-studio", "documents", "studio", {
    tagline: "Busy studios filing paperwork for many clients.",
    monthlyDocuments: 2000,
    price: { monthly: 24.99, yearly: 249.9 },
    popular: true,
  }),
  "docs-enterprise": plan("docs-enterprise", "documents", "enterprise", {
    tagline: "High-volume back offices.",
    monthlyDocuments: 7500,
    price: { monthly: 79.99, yearly: null },
  }),

  // Images + Documents: both allowances, about 17% less than the two plans bought separately.
  "complete-creator": plan("complete-creator", "complete", "creator", {
    tagline: "Every client asset and every client file.",
    monthlyImages: 1000,
    monthlyDocuments: 500,
    price: { monthly: 14.99, yearly: 149.9 },
  }),
  "complete-studio": plan("complete-studio", "complete", "studio", {
    tagline: "The whole studio's Drive, sorted.",
    monthlyImages: 5000,
    monthlyDocuments: 2000,
    price: { monthly: 44.99, yearly: 449.9 },
    popular: true,
  }),
  "complete-enterprise": plan("complete-enterprise", "complete", "enterprise", {
    tagline: "Every asset and document, at volume.",
    monthlyImages: 25000,
    monthlyDocuments: 7500,
    price: { monthly: 149.99, yearly: null },
  }),
};

export const PLAN_ORDER = [
  "free",
  "creator",
  "studio",
  "enterprise",
  "docs-creator",
  "docs-studio",
  "docs-enterprise",
  "complete-creator",
  "complete-studio",
  "complete-enterprise",
];

/** One-time image packs. Anyone can buy them; they never expire and are used after the plan's allowance. */
export const TOPUP_PACKS = [
  { id: "pack-250", images: 250, price: 4.99 },
  { id: "pack-1000", images: 1000, price: 14.99 },
  { id: "pack-5000", images: 5000, price: 49.99 },
];

/** One-time document packs, same rules as image packs. */
export const DOCUMENT_PACKS = [
  { id: "docs-pack-250", documents: 250, price: 5.99 },
  { id: "docs-pack-1000", documents: 1000, price: 19.99 },
  { id: "docs-pack-5000", documents: 5000, price: 79.99 },
];

/**
 * Per-file limits. These are what keep document pricing safe: the AI only ever
 * reads the first `pagesRead` pages of a PDF (or `textChars` characters of text),
 * so a 500-page file costs the same to sort as a 5-page one. Files over the size
 * limits are failed before any download or AI call, and never charged.
 */
export const FILE_LIMITS = {
  documentMaxMb: 20,
  pagesRead: 5,
  textChars: 12000, // about the same number of AI tokens as 5 PDF pages
  // Google Docs, Sheets and Slides edited this recently are left alone: someone may still be writing them.
  editingGraceMinutes: 10,
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
    families: FAMILIES.map((family) => ({ ...family })),
    plans: PLAN_ORDER.map((id) => ({ ...PLANS[id], price: { ...PLANS[id].price } })),
    topupPacks: TOPUP_PACKS.map((pack) => ({ ...pack })),
    documentPacks: DOCUMENT_PACKS.map((pack) => ({ ...pack })),
    fileLimits: { ...FILE_LIMITS },
    processLimits: { ...PROCESS_LIMITS },
  };
}
