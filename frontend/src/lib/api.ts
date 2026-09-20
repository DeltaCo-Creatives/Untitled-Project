import { supabase } from './supabase';
import type { ProcessKind } from './filename';

export type { ProcessKind };

// The localhost fallback is for `npm run dev` only; production builds must be given VITE_API_URL.
const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')).replace(
  /\/+$/,
  '',
);

// ---------------------------------------------------------------- Drive

export interface DriveFolder {
  id: string;
  name: string;
  parents?: string[];
  /** Present for shared-drive folders, which work processes don't support yet. */
  driveId?: string;
}

export interface FolderPage {
  folders: DriveFolder[];
  nextPageToken: string | null;
}

export interface FolderPath {
  /** From "My Drive" down to the folder. */
  path: { id: string; name: string }[];
  /** False for folders only shared with the user; automatic sorting can't see those. */
  inMyDrive: boolean;
}

export type WatchMode = 'live' | 'polling';

// ---------------------------------------------------------------- plans

export type PlanId =
  | 'free'
  | 'creator'
  | 'studio'
  | 'enterprise'
  | 'docs-creator'
  | 'docs-studio'
  | 'docs-enterprise'
  | 'complete-creator'
  | 'complete-studio'
  | 'complete-enterprise';
/** Which monthly allowances a plan includes. Free has a small lifetime allowance of both. */
export type PlanFamilyId = 'free' | 'images' | 'documents' | 'complete';
export type PlanTier = 'free' | 'creator' | 'studio' | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';

/** USD amounts. yearly is null where the plan is monthly-only (or free). */
export interface Price {
  monthly: number;
  yearly: number | null;
}

export interface PlanInfo {
  id: PlanId;
  family: PlanFamilyId;
  /** The scale shared across families: Creator, Studio or Enterprise (or Free). */
  tier: PlanTier;
  /** The tier's name ("Creator"); pair it with the family's label when the family matters. */
  label: string;
  tagline: string;
  maxProcesses: number;
  /** AI workers that can sort one process's Raw folder at the same time. */
  aiPerProcess: number;
  /** Lifetime allowances (Free only). */
  freeImages: number;
  freeDocuments: number;
  /** Allowances per billing period (paid plans). */
  monthlyImages: number;
  monthlyDocuments: number;
  billing: BillingInterval[];
  price: Price;
  /** The plan the pricing page highlights within its family. */
  popular: boolean;
  /** True once Lemon Squeezy has a variant configured for this plan — gates the buy button. Free is never purchasable. */
  purchasable: boolean;
}

export interface PlanFamily {
  id: Exclude<PlanFamilyId, 'free'>;
  label: string;
  description: string;
}

export interface TopupPack {
  id: string;
  images: number;
  price: number;
  /** True once Lemon Squeezy has a variant configured for this pack. */
  purchasable: boolean;
}

export interface DocumentPack {
  id: string;
  documents: number;
  price: number;
  /** True once Lemon Squeezy has a variant configured for this pack. */
  purchasable: boolean;
}

/** What the AI reads from each document, and the size limits, as shown on the pricing page. */
export interface FileLimits {
  documentMaxMb: number;
  /** The AI reads at most this many PDF pages per document — the cost cap. */
  pagesRead: number;
  /** ...or this many characters of text from Word, Google Docs and text files. */
  textChars: number;
  /** Google Docs, Sheets and Slides edited this recently are left alone (someone may still be writing). */
  editingGraceMinutes: number;
}

export interface ProcessLimits {
  maxDestinations: number;
  maxTagFields: number;
  nameMax: number;
  descriptionMax: number;
  instructionsMax: number;
  tagLabelMax: number;
  tagDescriptionMax: number;
  templateMax: number;
}

export interface PlansResponse {
  currency: string;
  families: PlanFamily[];
  plans: PlanInfo[];
  topupPacks: TopupPack[];
  documentPacks: DocumentPack[];
  fileLimits: FileLimits;
  processLimits: ProcessLimits;
  /** false: prices are tax-exclusive, and the Merchant of Record adds the local rate at checkout. */
  pricesIncludeTax: boolean;
  /** e.g. "Lemon Squeezy". null while no payment provider is wired up. */
  merchantOfRecord: string | null;
  /**
   * True once checkout is actually configured server-side (a Lemon Squeezy store plus at least one variant).
   * Normalized to false when absent, so an older backend that predates checkout keeps every buy button showing
   * "Coming soon" exactly as it does today.
   */
  checkoutEnabled: boolean;
}

export interface CurrentPlan {
  id: PlanId;
  family: PlanFamilyId;
  label: string;
  maxProcesses: number;
  aiPerProcess: number;
  freeImages: number;
  freeDocuments: number;
  monthlyImages: number;
  monthlyDocuments: number;
}

/** One kind's allowance: lifetime free, this billing period, and non-expiring packs. */
export interface KindUsage {
  freeUsed: number;
  freeLimit: number;
  periodUsed: number;
  periodLimit: number;
  topupBalance: number;
  /** Files of this kind DriveTag can still sort: free + this period + packs. */
  remaining: number;
  exhausted: boolean;
}

export interface Usage {
  status: string;
  /** Per kind. The flat fields below repeat `images`, for clients that predate documents. */
  images: KindUsage;
  documents: KindUsage;
  freeUsed: number;
  freeLimit: number;
  periodUsed: number;
  periodLimit: number;
  periodStart: string | null;
  periodResetsAt: string | null;
  topupBalance: number;
  /** Images DriveTag can still sort: free + this period + top-up balance. */
  remaining: number;
  exhausted: boolean;
}

export interface MeResponse {
  user: { id: string; email: string | undefined };
  driveConnected: boolean;
  watching: boolean;
  /** `polling` = Google refused the webhook, so the backend checks the folder on a timer. */
  watchMode: WatchMode | null;
  watchExpiresAt: string | null;
  autoSyncSeconds: number | null;
  /** null only when the user hasn't connected Drive yet (no subscription row). */
  plan: CurrentPlan | null;
  usage: Usage | null;
  processCounts: { total: number; active: number; max: number };
  /** ADMIN_EMAILS match — a convenience for showing admin UI, never a security boundary; the backend re-checks. */
  admin: boolean;
  beta: BetaStatus;
  /** true while the Google OAuth app is in Testing status: Drive refresh tokens expire after 7 days. */
  googleAppTesting: boolean;
  /** When Drive was connected (google_credentials.updated_at, ISO). null until it's connected. */
  driveConnectedAt: string | null;
}

// ---------------------------------------------------------------- beta

export interface BetaStatus {
  /** True only once a signup row for this email has been marked added_to_google. */
  tester: boolean;
  /** 0 unless a beta discount is configured AND this user is a tester. */
  discountPercent: number;
  /** null unless a beta discount is configured AND this user is a tester — never leaked otherwise. */
  discountCode: string | null;
}

export interface BetaSignupInput {
  name: string;
  email: string;
  workType?: string;
  weeklyVolume?: string;
  consent: boolean;
}

/** As the admin listing and PATCH response serialize it (camelCase, like processes). */
export interface BetaSignup {
  id: string;
  email: string;
  name: string;
  workType: string | null;
  weeklyVolume: string | null;
  addedToGoogle: boolean;
  addedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BetaSignupsResponse {
  signups: BetaSignup[];
  counts: { total: number; added: number; pending: number };
}

export interface BetaSignupPatch {
  addedToGoogle?: boolean;
  notes?: string;
}

// ---------------------------------------------------------------- work processes

export interface TagField {
  key: string;
  label: string;
  description: string;
}

export interface Destination {
  id: string;
  name: string;
  description: string;
  folderId: string;
  folderName: string | null;
  /** The "Unsorted" destination for images that fit none of the others. */
  isFallback: boolean;
  position: number;
}

export interface WorkProcess {
  id: string;
  /** What the process sorts. Chosen when it's created and can't be changed afterwards. */
  kind: ProcessKind;
  name: string;
  rawFolderId: string;
  rawFolderName: string | null;
  masterFolderId: string;
  masterFolderName: string | null;
  renameTemplate: string;
  instructions: string;
  tagFields: TagField[];
  timezone: string;
  enabled: boolean;
  /** Over the plan's process limit (oldest processes win): can be edited or deleted, but doesn't run. */
  locked: boolean;
  /** enabled && !locked */
  active: boolean;
  createdAt: string;
  updatedAt: string;
  destinations: Destination[];
}

export type DestinationFolderInput =
  | { mode: 'existing'; id: string }
  /** DriveTag finds or creates a subfolder named after the destination inside Master. */
  | { mode: 'create' }
  /** Unsorted only: the Master folder itself. */
  | { mode: 'master' };

export interface DestinationInput {
  id?: string | null;
  name: string;
  description: string;
  isFallback: boolean;
  folder: DestinationFolderInput;
}

export interface ProcessInput {
  /** Required when creating; must match the existing kind when updating. */
  kind: ProcessKind;
  name: string;
  rawFolderId: string;
  masterFolderId: string;
  renameTemplate: string;
  instructions: string;
  timezone: string;
  enabled?: boolean;
  tagFields: TagField[];
  destinations: DestinationInput[];
}

export interface ProcessesResponse {
  processes: WorkProcess[];
  limit: { used: number; max: number; planId: PlanId };
}

export interface ProcessCounts {
  waiting: number;
  processing: number;
  failed: number;
  total: number;
}

export type ProcessStatusEntry = ProcessCounts | { error: string };

export interface ProcessesStatus {
  /** The user's single sweep slot is busy. */
  syncing: boolean;
  kind: 'sweep' | 'organize' | null;
  /** The process being organized, or null for a sweep across all of them. */
  activeProcessId: string | null;
  statuses: Record<string, ProcessStatusEntry>;
  /** AI workers busy on each process right now, keyed by process id (absent = 0). */
  workers: Record<string, number>;
}

export interface OrganizeResponse {
  started: boolean;
  reason?: string;
  waiting?: number;
  /** How many of the waiting files the user's remaining balance of that kind covers. */
  willProcess?: number;
}

// ---------------------------------------------------------------- activity

export interface ActivityTagField {
  key: string;
  label: string;
  value: string;
}

/** What the AI returned. Image processes fill genre/subject/style; document processes fill type/topic/organization. */
export interface ActivityTags {
  genre?: string;
  subject?: string;
  style?: string;
  type?: string;
  topic?: string;
  organization?: string;
  /** YYYY-MM-DD, or empty when the document shows no date. */
  document_date?: string;
  fields?: ActivityTagField[];
}

export interface ActivityEntry {
  file_id: string;
  /** Rows written before document processes existed have no kind; treat them as images. */
  kind?: ProcessKind;
  original_name: string | null;
  new_name: string | null;
  tags: ActivityTags | null;
  status: 'processing' | 'completed' | 'failed';
  error_message: string | null;
  processed_at: string | null;
  process_id: string | null;
  destination_name: string | null;
}

// ---------------------------------------------------------------- client

export interface FieldError {
  /** e.g. "name", "destinations[2].folder", "tagFields[0].key" */
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: FieldError[];
  constructor(message: string, status: number, code?: string, details?: FieldError[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError('This build of DriveTag has no API address (VITE_API_URL). Set it on the host and rebuild.', 0);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    // fetch only rejects on network/CORS failures, which the browser reports as a bare "Failed to fetch".
    throw new ApiError(
      `Couldn't reach the DriveTag server at ${API_URL}. Check that the backend is running and that this page's address (${window.location.origin}) is listed in CORS_ORIGINS.`,
      0,
    );
  }

  if (!res.ok) {
    let message = res.statusText || `Request failed with status ${res.status}`;
    let code: string | undefined;
    let details: FieldError[] | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (typeof body?.code === 'string') code = body.code;
      if (Array.isArray(body?.details)) details = body.details;
    } catch {
      // response had no JSON body; keep the status text
    }
    throw new ApiError(message, res.status, code, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Like `request`, but for a non-JSON response (the beta signups CSV export). */
async function requestBlob(path: string): Promise<Blob> {
  if (!API_URL) {
    throw new ApiError('This build of DriveTag has no API address (VITE_API_URL). Set it on the host and rebuild.', 0);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers();
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers });
  } catch {
    throw new ApiError(
      `Couldn't reach the DriveTag server at ${API_URL}. Check that the backend is running and that this page's address (${window.location.origin}) is listed in CORS_ORIGINS.`,
      0,
    );
  }

  if (!res.ok) {
    let message = res.statusText || `Request failed with status ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (typeof body?.code === 'string') code = body.code;
    } catch {
      // response had no JSON body; keep the status text
    }
    throw new ApiError(message, res.status, code);
  }

  return res.blob();
}

function query(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// A backend that predates document processes omits these fields; the gap only lasts while a deploy rolls out.
function withKind(process: WorkProcess): WorkProcess {
  return { ...process, kind: process.kind ?? 'image' };
}

const NO_USAGE: KindUsage = {
  freeUsed: 0,
  freeLimit: 0,
  periodUsed: 0,
  periodLimit: 0,
  topupBalance: 0,
  remaining: 0,
  exhausted: true,
};

const NO_BETA_STATUS: BetaStatus = { tester: false, discountPercent: 0, discountCode: null };

function withKindUsage(me: MeResponse): MeResponse {
  const usage = me.usage;
  const plan = me.plan;
  return {
    ...me,
    admin: me.admin ?? false,
    beta: me.beta ?? NO_BETA_STATUS,
    googleAppTesting: me.googleAppTesting ?? false,
    driveConnectedAt: me.driveConnectedAt ?? null,
    plan: plan
      ? {
          ...plan,
          family: plan.family ?? (plan.id === 'free' ? 'free' : 'images'),
          freeDocuments: plan.freeDocuments ?? 0,
          monthlyDocuments: plan.monthlyDocuments ?? 0,
        }
      : null,
    usage: usage
      ? {
          ...usage,
          images: usage.images ?? {
            freeUsed: usage.freeUsed,
            freeLimit: usage.freeLimit,
            periodUsed: usage.periodUsed,
            periodLimit: usage.periodLimit,
            topupBalance: usage.topupBalance,
            remaining: usage.remaining,
            exhausted: usage.exhausted,
          },
          documents: usage.documents ?? NO_USAGE,
        }
      : null,
  };
}

function withPlanFamilies(body: PlansResponse): PlansResponse {
  return {
    ...body,
    // Deploy-window safety: Vercel usually finishes before DigitalOcean, so an in-flight deploy can still be
    // served by a backend that predates checkout. Defaulting both to false keeps every buy button saying
    // "Coming soon", exactly like today, until the new backend is actually live.
    checkoutEnabled: body.checkoutEnabled ?? false,
    families: body.families ?? [],
    plans: body.plans.map((plan) => ({
      ...plan,
      family: plan.family ?? (plan.id === 'free' ? 'free' : 'images'),
      tier: plan.tier ?? (plan.id as PlanTier),
      freeDocuments: plan.freeDocuments ?? 0,
      monthlyDocuments: plan.monthlyDocuments ?? 0,
      purchasable: plan.purchasable ?? false,
    })),
    topupPacks: (body.topupPacks ?? []).map((pack) => ({ ...pack, purchasable: pack.purchasable ?? false })),
    documentPacks: (body.documentPacks ?? []).map((pack) => ({ ...pack, purchasable: pack.purchasable ?? false })),
    fileLimits: body.fileLimits ?? { documentMaxMb: 20, pagesRead: 5, textChars: 12000, editingGraceMinutes: 10 },
    pricesIncludeTax: body.pricesIncludeTax ?? false,
    merchantOfRecord: body.merchantOfRecord ?? null,
  };
}

export const api = {
  me: () => request<MeResponse>('/api/me').then(withKindUsage),
  activity: ({ limit, processId }: { limit?: number; processId?: string } = {}) =>
    request<{ activity: ActivityEntry[] }>(`/api/activity${query({ limit, processId })}`),

  plans: () => request<PlansResponse>('/api/plans').then(withPlanFamilies),

  /**
   * `item` is a plan id or pack id from GET /api/plans; `billing` only matters when `item` is a plan.
   * 503 `checkout_unconfigured` when Lemon Squeezy isn't set up, 400 `unknown_item` for an unrecognized id.
   */
  createCheckout: ({ item, billing }: { item: string; billing?: BillingInterval }) =>
    request<{ url: string }>('/api/checkout', { method: 'POST', body: JSON.stringify({ item, billing }) }),

  startGoogleAuth: () => request<{ authUrl: string }>('/api/auth/google/start', { method: 'POST' }),
  /**
   * Finishes Drive-connect: the OAuth callback parks the grant under a one-time id (?pending= on /connect), and only the
   * signed-in DriveTag user who started the flow can claim it. 403 code `drive_connect_mismatch` otherwise.
   */
  completeGoogleAuth: (pending: string) =>
    request<{ connected: boolean }>('/api/auth/google/complete', { method: 'POST', body: JSON.stringify({ pending }) }),
  disconnectGoogle: () => request<{ disconnected: boolean }>('/api/auth/google', { method: 'DELETE' }),
  /**
   * Permanently deletes the account: stops sorting, revokes Drive access at Google, then deletes every stored row.
   * Files in Drive are never touched. 409 code `sorting_in_progress` while a sweep runs.
   */
  deleteAccount: () =>
    request<{ deleted: boolean }>('/api/me', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) }),

  /** Public, no auth. Returns the same body whether the email is new or already on the list. */
  submitBetaSignup: (body: BetaSignupInput) =>
    request<{ received: boolean }>('/api/beta/signups', { method: 'POST', body: JSON.stringify(body) }),
  /** Admin only; the backend 403s (`not_admin`) for anyone else regardless of what the UI shows. */
  listBetaSignups: () => request<BetaSignupsResponse>('/api/beta/signups'),
  updateBetaSignup: (id: string, patch: BetaSignupPatch) =>
    request<{ signup: BetaSignup }>(`/api/beta/signups/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  /** Fetches the CSV with the auth header (a bearer token can't go in an <a href>) and triggers a file download. */
  downloadBetaSignupsCsv: async () => {
    const blob = await requestBlob('/api/beta/signups.csv');
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = 'drivetag-beta-signups.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  listFolders: ({ q, parentId, pageToken }: { q?: string; parentId?: string; pageToken?: string | null } = {}) =>
    request<FolderPage>(`/api/drive/folders${query({ q, parentId, pageToken })}`),
  createFolder: (name: string, parentId: string) =>
    request<{ folder: DriveFolder }>('/api/drive/folders', { method: 'POST', body: JSON.stringify({ name, parentId }) }),
  folderPath: (folderId: string) => request<FolderPath>(`/api/drive/folders/${encodeURIComponent(folderId)}/path`),

  getWatch: () =>
    request<{ watching: boolean; mode: WatchMode | null; expiresAt: string | null }>('/api/drive/watch'),
  startWatch: () =>
    request<{ watching: boolean; mode: WatchMode; expiresAt: string | null }>('/api/drive/watch', { method: 'POST' }),
  stopWatch: () => request<{ watching: boolean; stopped: boolean }>('/api/drive/watch', { method: 'DELETE' }),

  processes: {
    list: () =>
      request<ProcessesResponse>('/api/processes').then((body) => ({
        ...body,
        processes: body.processes.map(withKind),
      })),
    get: (id: string) =>
      request<{ process: WorkProcess }>(`/api/processes/${id}`).then((body) => ({ process: withKind(body.process) })),
    create: (input: ProcessInput) =>
      request<{ process: WorkProcess }>('/api/processes', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: ProcessInput) =>
      request<{ process: WorkProcess }>(`/api/processes/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    setEnabled: (id: string, enabled: boolean) =>
      request<{ process: WorkProcess }>(`/api/processes/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    remove: (id: string) =>
      request<{ deleted: boolean; watchStopped: boolean }>(`/api/processes/${id}`, { method: 'DELETE' }),
    status: () => request<ProcessesStatus>('/api/processes/status'),
    organize: (id: string, retryFailed = false) =>
      request<OrganizeResponse>(`/api/processes/${id}/organize`, {
        method: 'POST',
        body: JSON.stringify({ retryFailed }),
      }),
  },
};
