/**
 * Every plan limit lives here and only here. The SQL functions receive these
 * numbers as arguments (see supabase/migrations/0002_work_processes.sql), so
 * changing an allowance is a one-line edit plus a backend deploy.
 *
 * priceLabel stays null until a payment provider is integrated; the UI shows
 * "Coming soon" for null prices.
 */
export const PLANS = {
  free: {
    id: "free",
    label: "Free",
    tagline: "Try DriveTag on your own Drive, no time limit.",
    maxProcesses: 1,
    freeImages: 100, // lifetime, not monthly
    monthlyImages: 0,
    billing: [],
    priceLabel: null,
  },
  creator: {
    id: "creator",
    label: "Creator",
    tagline: "For freelancers juggling a few clients.",
    maxProcesses: 5,
    freeImages: 0,
    monthlyImages: 1000,
    billing: ["monthly", "yearly"],
    priceLabel: null,
  },
  studio: {
    id: "studio",
    label: "Studio",
    tagline: "For agencies sorting for many clients at once.",
    maxProcesses: 15,
    freeImages: 0,
    monthlyImages: 5000,
    billing: ["monthly", "yearly"],
    priceLabel: null,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    tagline: "High-volume teams with dozens of pipelines.",
    maxProcesses: 50,
    freeImages: 0,
    monthlyImages: 25000,
    billing: ["monthly"], // monthly only, by decision
    priceLabel: null,
  },
};

export const PLAN_ORDER = ["free", "creator", "studio", "enterprise"];

/** One-time image packs. Anyone can buy them; they never expire and are used after the plan's allowance. */
export const TOPUP_PACKS = [
  { id: "pack-250", images: 250, priceLabel: null },
  { id: "pack-1000", images: 1000, priceLabel: null },
  { id: "pack-5000", images: 5000, priceLabel: null },
];

/** Per-process editing limits, enforced by utils/processValidation.js and mirrored in the editor UI. */
export const PROCESS_LIMITS = {
  maxDestinations: 20, // not counting Unsorted; keeps Gemini's destination enum small and accurate
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
    plans: PLAN_ORDER.map((id) => ({ ...PLANS[id] })),
    topupPacks: TOPUP_PACKS.map((pack) => ({ ...pack })),
    processLimits: { ...PROCESS_LIMITS },
  };
}
