import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type ActivityEntry,
  type MeResponse,
  type OrganizeResponse,
  type ProcessCounts,
  type ProcessesResponse,
  type ProcessesStatus,
  type ProcessStatusEntry,
  type WorkProcess,
} from '../../lib/api';
import { errorMessage } from '../../lib/messages';

const ACTIVITY_LIMIT = 50;
const FAST_POLL_MS = 3_000;
const SLOW_POLL_MS = 30_000;

export type ProcessQuota = ProcessesResponse['limit'];

export type WatchState = 'live' | 'polling' | 'expired' | 'off';

/** An "Organize now" this tab started, remembered so its progress bar can be determinate. */
export interface OrganizeRun {
  /** Images the run should sort: the remaining balance may cover fewer than are waiting. */
  total: number;
  /** Waiting images (plus failed ones when retrying) when the run started. */
  startRemaining: number;
  /** A "Retry failed" run: failed images are still to do, not done. */
  retryFailed: boolean;
  /** The last load issued before the run started; only later loads may end it. */
  afterLoad: number;
}

export type OrganizeRuns = Record<string, OrganizeRun>;

export interface OrganizeProgress {
  /** 0–1 */
  progress: number;
  done: number;
  total: number;
}

export function watchStateOf(me: MeResponse | null): WatchState {
  if (!me?.watching) return 'off';
  if (me.watchMode === 'polling') return 'polling';
  if (me.watchExpiresAt && new Date(me.watchExpiresAt).getTime() < Date.now()) return 'expired';
  return 'live';
}

export function isCountsEntry(entry: ProcessStatusEntry | undefined): entry is ProcessCounts {
  return entry !== undefined && !('error' in entry);
}

/** True while this process is the one being organized, including the moment between clicking and the next status poll. */
export function isOrganizing(processId: string, status: ProcessesStatus | null, runs: OrganizeRuns) {
  if (runs[processId]) return true;
  return Boolean(status?.syncing && status.kind === 'organize' && status.activeProcessId === processId);
}

/** Determinate progress for a run this tab started, or null when the total isn't known. */
export function organizeProgress(run: OrganizeRun | undefined, entry: ProcessStatusEntry | undefined): OrganizeProgress | null {
  if (!run || run.total <= 0 || !isCountsEntry(entry)) return null;
  // When retrying, failed images stay "left" until they're sorted. Otherwise a poll that lands before the server
  // releases their claims would count them as done, and the bar would jump to full and then drop back.
  const left = entry.waiting + entry.processing + (run.retryFailed ? entry.failed : 0);
  // Images dropped into Raw mid-run raise `left`; clamping keeps the bar from moving backwards past zero.
  const done = Math.min(run.total, Math.max(0, run.startRemaining - left));
  return { progress: done / run.total, done, total: run.total };
}

/**
 * Everything the dashboard shows, kept live: fast polling while images are being
 * organized, slow otherwise, paused in background tabs and refreshed on return.
 */
export function useDashboardData() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [processes, setProcesses] = useState<WorkProcess[]>([]);
  const [limit, setLimit] = useState<ProcessQuota | null>(null);
  const [status, setStatus] = useState<ProcessesStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runs, setRuns] = useState<OrganizeRuns>({});

  // Each load takes a number; only the newest one's results land, so a slow poll can't overwrite a fresher refresh.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    loadSeq.current += 1;
    const seq = loadSeq.current;
    try {
      const [meRes, activityRes] = await Promise.all([api.me(), api.activity({ limit: ACTIVITY_LIMIT })]);

      let processesRes: ProcessesResponse | null = null;
      let statusRes: ProcessesStatus | null = null;
      let statusFailure: string | null = null;
      if (meRes.driveConnected) {
        const [listResult, statusResult] = await Promise.allSettled([api.processes.list(), api.processes.status()]);
        if (listResult.status === 'rejected') throw listResult.reason;
        processesRes = listResult.value;
        if (statusResult.status === 'fulfilled') statusRes = statusResult.value;
        else statusFailure = errorMessage(statusResult.reason, 'Something went wrong on our side.');
      }

      if (seq !== loadSeq.current) return;

      setMe(meRes);
      setActivity(activityRes.activity);
      setLoadError(null);
      setProcesses(processesRes?.processes ?? []);
      setLimit(processesRes?.limit ?? null);
      setStatusError(statusFailure);
      if (statusRes || !meRes.driveConnected) setStatus(statusRes);

      // A run is over once a load that began after it sees the sweep slot free (or busy with something else).
      if (statusRes || !meRes.driveConnected) {
        const fresh = statusRes;
        setRuns((previous) => {
          const ids = Object.keys(previous);
          const kept = ids.filter((id) => {
            const run = previous[id];
            if (seq <= run.afterLoad) return true;
            return Boolean(fresh?.syncing && fresh.kind === 'organize' && fresh.activeProcessId === id);
          });
          if (kept.length === ids.length) return previous;
          return Object.fromEntries(kept.map((id) => [id, previous[id]]));
        });
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setLoadError(errorMessage(err, 'Failed to load your dashboard'));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  // First load. Scheduled rather than called inline so StrictMode's mount/unmount/mount in dev cancels the
  // first request instead of sending two.
  useEffect(() => {
    const seq = loadSeq;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      // Drop whatever is still in flight when the page goes away.
      seq.current += 1;
    };
  }, [load]);

  const hasData = me !== null;
  const fast =
    Boolean(status?.syncing) || Object.keys(runs).length > 0 || activity.some((entry) => entry.status === 'processing');

  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;
    let timer: number | undefined;
    const delay = fast ? FAST_POLL_MS : SLOW_POLL_MS;

    const tick = async () => {
      if (document.visibilityState === 'visible') await load();
      if (!cancelled) timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, delay);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hasData, fast, load]);

  /** Shows the full-page skeleton again, e.g. from the error state's "Try again". */
  const retry = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  /** A manual refresh: spins the Refresh icon until the load lands. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /** Swap in a process the server just returned (e.g. after toggling it) without waiting for the next poll. */
  const replaceProcess = useCallback((next: WorkProcess) => {
    setProcesses((previous) => previous.map((process) => (process.id === next.id ? next : process)));
  }, []);

  /** Remember a started "Organize now" so the card can show how far along it is. */
  const trackOrganize = useCallback((processId: string, response: OrganizeResponse, retryFailed: boolean) => {
    if (!response.started) return;
    const waiting = response.waiting ?? 0;
    const total = Math.max(0, response.willProcess ?? waiting);
    setRuns((previous) => ({
      ...previous,
      [processId]: { total, startRemaining: waiting, retryFailed, afterLoad: loadSeq.current },
    }));
  }, []);

  return {
    me,
    activity,
    processes,
    limit,
    status,
    statusError,
    runs,
    loading,
    refreshing,
    loadError,
    /** Re-fetch everything quietly (after an action). */
    reload: load,
    refresh,
    retry,
    replaceProcess,
    trackOrganize,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
