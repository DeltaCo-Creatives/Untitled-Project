import { supabase } from './supabase';

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

export type PlanId = 'free' | 'creator' | 'studio' | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';

/** USD amounts. yearly is null where the plan is monthly-only (or free). */
export interface Price {
  monthly: number;
  yearly: number | null;
}

export interface PlanInfo {
  id: PlanId;
  label: string;
  tagline: string;
  maxProcesses: number;
  /** AI workers that can sort one process's Raw folder at the same time. */
  aiPerProcess: number;
  /** Lifetime images (Free only). */
  freeImages: number;
  /** Images per billing period (paid plans). */
  monthlyImages: number;
  billing: BillingInterval[];
  price: Price;
  /** The plan the pricing page highlights. */
  popular: boolean;
}

export interface TopupPack {
  id: string;
  images: number;
  price: number;
}

/** Document sorting is priced but not built yet: while available is false every document price is a preview. */
export interface DocumentPricing {
  available: boolean;
  /** The AI reads at most this many pages of a document (the cost cap). */
  pagesRead: number;
  maxFileMb: number;
  /** Lifetime documents on the Free plan. */
  freeDocuments: number;
  /** Add-on for an image plan, keyed by plan id; uses that plan's processes and AI workers. */
  addons: Partial<Record<PlanId, { monthlyDocuments: number; price: Price }>>;
  /** Document-only plans. */
  plans: {
    id: string;
    label: string;
    tagline: string;
    maxProcesses: number;
    aiPerProcess: number;
    monthlyDocuments: number;
    billing: BillingInterval[];
    price: Price;
  }[];
  packs: { id: string; documents: number; price: number }[];
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
  plans: PlanInfo[];
  topupPacks: TopupPack[];
  documents: DocumentPricing;
  processLimits: ProcessLimits;
}

export interface CurrentPlan {
  id: PlanId;
  label: string;
  maxProcesses: number;
  aiPerProcess: number;
  freeImages: number;
  monthlyImages: number;
}

export interface Usage {
  status: string;
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
  /** How many of the waiting images the user's remaining balance covers. */
  willProcess?: number;
}

// ---------------------------------------------------------------- activity

export interface ActivityTagField {
  key: string;
  label: string;
  value: string;
}

export interface ActivityTags {
  genre?: string;
  subject?: string;
  style?: string;
  fields?: ActivityTagField[];
}

export interface ActivityEntry {
  file_id: string;
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

function query(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  me: () => request<MeResponse>('/api/me'),
  activity: ({ limit, processId }: { limit?: number; processId?: string } = {}) =>
    request<{ activity: ActivityEntry[] }>(`/api/activity${query({ limit, processId })}`),

  plans: () => request<PlansResponse>('/api/plans'),

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
    list: () => request<ProcessesResponse>('/api/processes'),
    get: (id: string) => request<{ process: WorkProcess }>(`/api/processes/${id}`),
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
