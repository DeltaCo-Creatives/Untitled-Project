import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface DriveFolder {
  id: string;
  name: string;
}

export interface FolderConfig {
  rawFolderId: string;
  rawFolderName: string;
  destinationFolderId: string;
  destinationFolderName: string;
}

export interface MeResponse {
  user: { id: string; email: string | undefined };
  driveConnected: boolean;
  config: FolderConfig | null;
  watching: boolean;
  watchExpiresAt: string | null;
  subscription: {
    status: string;
    plan: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  } | null;
  entitled: boolean;
}

export interface ActivityEntry {
  id: string;
  file_id: string;
  original_name: string | null;
  new_name: string | null;
  created_at: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = res.statusText || `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response had no JSON body; keep the status text
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => request<MeResponse>('/api/me'),
  activity: (limit?: number) =>
    request<{ activity: ActivityEntry[] }>(`/api/activity${limit ? `?limit=${limit}` : ''}`),

  startGoogleAuth: () => request<{ authUrl: string }>('/api/auth/google/start', { method: 'POST' }),
  disconnectGoogle: () => request<{ disconnected: boolean }>('/api/auth/google', { method: 'DELETE' }),

  listFolders: (q?: string) =>
    request<{ folders: DriveFolder[] }>(`/api/drive/folders${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getConfig: () => request<{ config: FolderConfig | null }>('/api/drive/config'),
  saveConfig: (rawFolderId: string, destinationFolderId: string) =>
    request<{ config: FolderConfig }>('/api/drive/config', {
      method: 'POST',
      body: JSON.stringify({ rawFolderId, destinationFolderId }),
    }),

  getWatch: () => request<{ watching: boolean; expiresAt: string | null }>('/api/drive/watch'),
  startWatch: () => request<{ watching: boolean; expiresAt: string }>('/api/drive/watch', { method: 'POST' }),
  stopWatch: () => request<{ watching: boolean; stopped: boolean }>('/api/drive/watch', { method: 'DELETE' }),
};
