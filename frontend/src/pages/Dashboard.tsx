import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  Check,
  CircleAlert,
  CircleCheck,
  CreditCard,
  FolderCheck,
  FolderInput,
  HardDrive,
  ImageUp,
  Images,
  Info,
  LoaderCircle,
  LogOut,
  Pause,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Unplug,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, type ActivityEntry, type MeResponse, type RawStatus } from '../lib/api';
import { gsap, useGSAP, SplitText, MOTION_OK, REDUCED_MOTION, prefersReducedMotion } from '../lib/gsap';
import { displayTag, errorMessage, friendlyWatchError } from '../lib/messages';
import { Logo } from '../components/ui/Logo';
import { Button, ButtonLink } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

const ACTIVITY_LIMIT = 50;
const FAST_POLL_MS = 3_000;
const SLOW_POLL_MS = 30_000;

type WatchState = 'live' | 'polling' | 'expired' | 'off';

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function timeAgo(iso: string | null) {
  if (!iso) return 'in progress';
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const ranges: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of ranges) {
    if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function watchStateOf(me: MeResponse | null): WatchState {
  if (!me?.watching) return 'off';
  if (me.watchMode === 'polling') return 'polling';
  if (me.watchExpiresAt && new Date(me.watchExpiresAt).getTime() < Date.now()) return 'expired';
  return 'live';
}

const STATUS_STYLES: Record<ActivityEntry['status'], { bubble: string; label: string }> = {
  completed: { bubble: 'bg-sage', label: 'Organized' },
  processing: { bubble: 'bg-butter', label: 'Processing' },
  failed: { bubble: 'bg-rose', label: 'Failed' },
};

const TAG_TINTS = ['bg-lavender-soft', 'bg-butter-soft', 'bg-sage-soft'];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const knobPlaced = useRef(false);
  const seenFileIds = useRef<Set<string> | null>(null);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [raw, setRaw] = useState<RawStatus | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const [watchBusy, setWatchBusy] = useState(false);
  const [organizeBusy, setOrganizeBusy] = useState(false);
  const [syncTotal, setSyncTotal] = useState<number | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // The notice is one-time: drop it from history so a reload doesn't show it again.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const load = useCallback(async () => {
    try {
      const [meRes, activityRes] = await Promise.all([api.me(), api.activity(ACTIVITY_LIMIT)]);
      setMe(meRes);
      setActivity(activityRes.activity);
      setLoadError(null);

      if (meRes.driveConnected && meRes.config) {
        try {
          const status = await api.rawStatus();
          setRaw(status);
          setRawError(null);
          if (!status.syncing) setSyncTotal(null);
        } catch (err) {
          setRawError(errorMessage(err, 'Couldn’t check your Raw folder'));
        }
      } else {
        setRaw(null);
      }
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load your dashboard'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasData = me !== null;
  // `syncing` covers webhook, polling and Organize-now sweeps (they share one lock). Stale
  // `processing` rows from a crashed run must not pin the page to fast polling forever.
  const busy = Boolean(raw?.syncing);

  // Keep the page live: fast while files are being organized, slow otherwise, paused in background tabs.
  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;
    let timer: number | undefined;
    const delay = busy ? FAST_POLL_MS : SLOW_POLL_MS;

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
  }, [hasData, busy, load]);

  const configured = Boolean(me?.driveConnected && me?.config);
  const view = loading ? 'loading' : !me ? 'error' : configured ? 'ready' : 'setup';
  const watchState = watchStateOf(me);
  const sortingActive = watchState === 'live' || watchState === 'polling';

  const retry = () => {
    setLoading(true);
    void load();
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleToggleWatch = async () => {
    if (!me) return;
    setWatchBusy(true);
    setActionError(null);
    try {
      if (sortingActive) {
        await api.stopWatch();
      } else {
        await api.startWatch();
      }
      await load();
    } catch (err) {
      setActionError(friendlyWatchError(errorMessage(err, 'Couldn’t update automatic sorting')));
    } finally {
      setWatchBusy(false);
    }
  };

  const handleOrganize = async (retryFailed: boolean) => {
    if (!raw) return;
    setOrganizeBusy(true);
    setActionError(null);
    try {
      const result = await api.organize(retryFailed);
      if (result.started) {
        setSyncTotal(raw.waiting + (retryFailed ? raw.failed : 0));
      } else if (result.reason) {
        setNotice(result.reason);
      }
      await load();
    } catch (err) {
      setActionError(errorMessage(err, 'Couldn’t start organizing'));
    } finally {
      setOrganizeBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setActionError(null);
    try {
      await api.disconnectGoogle();
      setConfirmDisconnect(false);
      await load();
    } catch (err) {
      setConfirmDisconnect(false);
      setActionError(errorMessage(err, 'Couldn’t disconnect Google Drive'));
    } finally {
      setDisconnecting(false);
    }
  };

  const closeDisconnect = useCallback(() => setConfirmDisconnect(false), []);

  const counts = activity.reduce(
    (acc, entry) => ({ ...acc, [entry.status]: acc[entry.status] + 1 }),
    { completed: 0, processing: 0, failed: 0 } as Record<ActivityEntry['status'], number>,
  );
  const latest = activity.find((entry) => entry.status === 'completed' && entry.new_name);

  const fullName = user?.user_metadata?.full_name as string | undefined;
  const firstName = fullName?.trim().split(/\s+/)[0];
  const trialDays = me?.subscription?.status === 'trialing' ? daysUntil(me.subscription.trialEndsAt) : null;

  const syncing = Boolean(raw?.syncing);
  const remaining = raw ? raw.waiting + raw.processing : 0;
  const progress = syncing && syncTotal ? Math.min(1, Math.max(0, 1 - remaining / syncTotal)) : null;
  const bannerError = actionError ?? (me ? loadError : null);

  // ---------------------------------------------------------------- animation

  useGSAP(
    () => {
      if (!pageRef.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.dash-nav > *', { y: -20, autoAlpha: 0, stagger: 0.08, duration: 0.6, ease: 'back.out(1.7)' });
      });
      return () => mm.revert();
    },
    { scope: pageRef },
  );

  // Entrance for whichever view just appeared; polling refreshes don't change `view`, so this doesn't replay.
  useGSAP(
    () => {
      if (!pageRef.current || view === 'loading') return;
      const root = pageRef.current;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const title = root.querySelector('.dash-title');
        if (title) {
          SplitText.create(title, {
            type: 'words',
            onSplit: (self) => gsap.from(self.words, { y: 24, autoAlpha: 0, stagger: 0.08, duration: 0.6, ease: 'back.out(2)' }),
          });
        }
        gsap.from(gsap.utils.toArray('.dash-card', root), {
          y: 36,
          scale: 0.97,
          autoAlpha: 0,
          stagger: 0.08,
          duration: 0.7,
          ease: 'back.out(1.5)',
        });
        const rows = gsap.utils.toArray<HTMLElement>('.activity-row', root);
        if (rows.length > 0) {
          gsap.from(rows, { x: -24, autoAlpha: 0, stagger: 0.05, duration: 0.5, ease: 'power3.out', delay: 0.35 });
        }
        const plug = root.querySelector('.setup-icon');
        if (plug) gsap.to(plug, { rotation: 12, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut', repeatDelay: 1.2 });
      });
      return () => mm.revert();
    },
    { dependencies: [view], scope: pageRef, revertOnUpdate: true },
  );

  // Slide in rows that arrived through polling, with a brief lavender glow.
  useGSAP(
    () => {
      if (view !== 'ready' || !pageRef.current) return;
      const previous = seenFileIds.current;
      seenFileIds.current = new Set(activity.map((entry) => entry.file_id));
      if (!previous) return;

      const fresh = gsap.utils
        .toArray<HTMLElement>('.activity-row', pageRef.current)
        .filter((row) => !previous.has(row.dataset.fileId ?? ''));
      if (fresh.length === 0) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          fresh,
          { x: -28, autoAlpha: 0, backgroundColor: 'rgb(239, 233, 255)' },
          { x: 0, autoAlpha: 1, duration: 0.55, stagger: 0.06, ease: 'back.out(1.6)' },
        );
        gsap.to(fresh, { backgroundColor: 'rgba(239, 233, 255, 0)', duration: 1.8, delay: 0.8, ease: 'power1.out' });
      });
      return () => mm.revert();
    },
    { dependencies: [activity, view], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const knob = pageRef.current?.querySelector('.switch-knob');
      if (!knob) {
        knobPlaced.current = false;
        return;
      }
      const animate = knobPlaced.current && !prefersReducedMotion();
      gsap.to(knob, { x: sortingActive ? 28 : 0, duration: animate ? 0.7 : 0, ease: 'elastic.out(1, 0.55)', overwrite: 'auto' });
      knobPlaced.current = true;
    },
    { dependencies: [sortingActive, view], scope: pageRef },
  );

  useGSAP(
    () => {
      if (!pageRef.current || view !== 'ready' || !sortingActive) return;
      const root = pageRef.current;
      const mm = gsap.matchMedia();
      mm.add(`${MOTION_OK} and (min-width: 640px)`, () => {
        const track = root.querySelector<HTMLElement>('.flow-track');
        if (!track) return;
        gsap.utils.toArray<HTMLElement>('.flow-dot', root).forEach((dot, i) => {
          gsap
            .timeline({ repeat: -1, delay: i * 0.7 })
            .fromTo(dot, { x: 0 }, { x: () => track.clientWidth - dot.offsetWidth, duration: 2.1, ease: 'sine.inOut' })
            .fromTo(dot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0)
            .to(dot, { autoAlpha: 0, duration: 0.3 }, 1.8);
        });
      });
      return () => mm.revert();
    },
    { dependencies: [view, sortingActive], scope: pageRef, revertOnUpdate: true },
  );

  // Determinate progress: glide the bar to the new fraction.
  useGSAP(
    () => {
      const fill = pageRef.current?.querySelector('.progress-fill');
      if (!fill || progress === null) return;
      gsap.to(fill, {
        scaleX: Math.max(progress, 0.04),
        xPercent: 0,
        duration: prefersReducedMotion() ? 0 : 0.6,
        ease: 'power2.out',
        overwrite: true,
      });
    },
    { dependencies: [progress, syncing], scope: pageRef },
  );

  // Indeterminate progress (e.g. the page was opened mid-run): a sweeping bar.
  const indeterminate = syncing && progress === null;
  useGSAP(
    () => {
      const fill = pageRef.current?.querySelector('.progress-fill');
      if (!fill || !indeterminate) return;
      const mm = gsap.matchMedia();
      mm.add(REDUCED_MOTION, () => {
        gsap.set(fill, { scaleX: 1, xPercent: 0 });
      });
      mm.add(MOTION_OK, () => {
        gsap.fromTo(fill, { scaleX: 0.35, xPercent: -40 }, { xPercent: 290, duration: 1.3, ease: 'sine.inOut', repeat: -1 });
      });
      return () => mm.revert();
    },
    { dependencies: [indeterminate, view], scope: pageRef, revertOnUpdate: true },
  );

  // A gentle bob on the waiting-images icon so the call to action gets noticed.
  const waitingIdle = Boolean(raw && raw.waiting > 0 && !syncing);
  useGSAP(
    () => {
      const icon = pageRef.current?.querySelector('.raw-icon');
      if (!icon || !waitingIdle) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(icon, { y: -6, rotation: -6, duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      });
      return () => mm.revert();
    },
    { dependencies: [waitingIdle, view], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      if (!pageRef.current?.querySelector('.dash-alert')) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.dash-alert', { y: -10, autoAlpha: 0, duration: 0.35 });
        gsap.to('.dash-alert', { keyframes: { x: [0, -8, 7, -4, 0] }, duration: 0.45 });
      });
      return () => mm.revert();
    },
    { dependencies: [bannerError], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      if (!pageRef.current?.querySelector('.dash-notice')) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.dash-notice', { y: -12, autoAlpha: 0, duration: 0.5, ease: 'back.out(1.8)' });
      });
      return () => mm.revert();
    },
    { dependencies: [notice, view], scope: pageRef, revertOnUpdate: true },
  );

  // ------------------------------------------------------------------- render

  const watchCopy: Record<WatchState, { title: string; detail: string | null }> = {
    live: {
      title: 'Live — Google Drive tells DriveTag the moment a file lands',
      detail: me?.watchExpiresAt ? `Watch channel active until ${new Date(me.watchExpiresAt).toLocaleString()}` : null,
    },
    polling: {
      title: me?.autoSyncSeconds
        ? `Checking your Raw folder every ${me.autoSyncSeconds} seconds`
        : 'Waiting for the server’s folder check to be switched on',
      detail: me?.autoSyncSeconds
        ? 'Live updates need a public, verified web address, so DriveTag checks on a timer instead.'
        : 'Set AUTO_SYNC_INTERVAL_SECONDS on the backend, or pause and restart once webhooks are set up.',
    },
    expired: {
      title: 'Watch expired — new images aren’t being picked up',
      detail: 'Turn automatic sorting on again to restart it.',
    },
    off: { title: 'Paused — new images won’t be sorted', detail: null },
  };

  return (
    <div ref={pageRef} className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-white/75 backdrop-blur-md">
        <div className="dash-nav mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo to="/dashboard" size="sm" />
          <div className="flex items-center gap-2">
            {user?.email && (
              <span className="hidden items-center gap-2 rounded-full bg-lavender-soft py-1 pl-1 pr-3 text-sm font-bold sm:inline-flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lavender font-display text-xs uppercase">
                  {user.email[0]}
                </span>
                {user.email}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {view === 'loading' ? (
          <div className="space-y-6" role="status" aria-label="Loading your dashboard">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-5 w-80" />
            <div className="grid gap-6 lg:grid-cols-3">
              <Skeleton className="h-64 lg:col-span-2" />
              <Skeleton className="h-64" />
              <Skeleton className="h-80 lg:col-span-3" />
            </div>
          </div>
        ) : view === 'error' ? (
          <div className="dash-card mx-auto max-w-lg rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose">
              <CircleAlert className="h-8 w-8 text-rose-ink" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">We couldn’t load your dashboard</h1>
            <p role="alert" className="mb-7 leading-relaxed text-ink-soft">
              {loadError}
            </p>
            <Button onClick={retry} size="lg">
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="dash-title text-4xl font-bold tracking-tight sm:text-5xl">
                  {firstName ? `Hello, ${firstName}` : 'Hello there'}
                </h1>
                <p className="mt-2 text-lg text-ink-soft">
                  {view === 'setup'
                    ? 'Let’s finish setting things up.'
                    : syncing
                      ? 'DriveTag is organizing your Raw folder right now.'
                      : sortingActive
                        ? 'DriveTag is quietly organizing your Drive.'
                        : 'Automatic sorting is off.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={refresh} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
                </Button>
                {view === 'ready' && (
                  <ButtonLink to="/onboarding" variant="secondary" size="sm">
                    <Settings2 className="h-4 w-4" /> Change folders
                  </ButtonLink>
                )}
              </div>
            </div>

            {notice && (
              <div
                role="status"
                className="dash-notice mb-6 flex items-start gap-3 rounded-2xl border border-butter bg-butter-soft px-4 py-3 text-sm font-semibold"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
                <span className="flex-1">{notice}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss"
                  className="rounded-lg p-0.5 text-ink-soft hover:bg-butter hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {bannerError && (
              <div
                role="alert"
                className="dash-alert mb-6 flex items-start gap-2 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink"
              >
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {bannerError}
              </div>
            )}

            {view === 'setup' ? (
              <div className="dash-card mx-auto max-w-xl rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
                <div className="setup-icon mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-lavender to-periwinkle shadow-soft">
                  <PlugZap className="h-9 w-9 text-ink" />
                </div>
                <h2 className="mb-2 text-2xl font-bold">
                  {me?.driveConnected ? 'Pick your folders' : 'Connect your Google Drive'}
                </h2>
                <p className="mx-auto mb-7 max-w-sm leading-relaxed text-ink-soft">
                  {me?.driveConnected
                    ? 'Google Drive is connected — choose a Raw folder to watch and a Destination to sort into.'
                    : 'Give DriveTag permission to watch one folder, and it’ll start tagging and sorting new images.'}
                </p>
                <ButtonLink to="/onboarding" size="lg" magnetic>
                  Continue setup
                </ButtonLink>
              </div>
            ) : (
              me?.config && (
                <div className="grid gap-6 lg:grid-cols-3">
                  {/* Automatic sorting */}
                  <section className="dash-card flex flex-col rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8 lg:col-span-2">
                    <div className="mb-7 flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold">Automatic sorting</h2>
                        <p className="mt-1 inline-flex items-start gap-2 text-sm font-bold text-ink-soft">
                          <span className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">
                            {sortingActive && (
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-80 motion-reduce:animate-none" />
                            )}
                            <span
                              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                                sortingActive ? 'bg-sage-deep' : watchState === 'expired' ? 'bg-rose-ink' : 'bg-ink-soft/40'
                              }`}
                            />
                          </span>
                          {watchCopy[watchState].title}
                        </p>
                        {watchCopy[watchState].detail && (
                          <p className="mt-1 pl-[1.125rem] text-xs text-ink-soft">{watchCopy[watchState].detail}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={sortingActive}
                        aria-label={sortingActive ? 'Turn off automatic sorting' : 'Turn on automatic sorting'}
                        onClick={handleToggleWatch}
                        disabled={watchBusy}
                        className={`relative h-9 w-16 shrink-0 rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:cursor-wait ${sortingActive ? 'bg-sage' : 'bg-line'}`}
                      >
                        <span className="switch-knob absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-soft">
                          {watchBusy ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : sortingActive ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </button>
                    </div>

                    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1 rounded-2xl bg-butter-soft p-4">
                        <FolderInput className="mb-2 h-5 w-5" />
                        <p className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">Watching</p>
                        <p className="truncate font-bold">{me.config.rawFolderName}</p>
                      </div>
                      <div className="flow-track relative hidden h-2.5 w-24 overflow-hidden rounded-full bg-lavender-soft sm:block lg:w-32">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="flow-dot invisible absolute left-0 top-0 h-2.5 w-2.5 rounded-full bg-lavender-deep opacity-0" />
                        ))}
                      </div>
                      <ArrowDown className="mx-auto h-5 w-5 text-lavender-deep sm:hidden" />
                      <div className="min-w-0 flex-1 rounded-2xl bg-sage-soft p-4">
                        <FolderCheck className="mb-2 h-5 w-5" />
                        <p className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">Sorting into</p>
                        <p className="truncate font-bold">{me.config.destinationFolderName}</p>
                      </div>
                    </div>

                    <div className="pt-6 lg:mt-auto">
                      <div className="rounded-2xl border border-dashed border-line p-4">
                        <p className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">Latest organized</p>
                        {latest ? (
                          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="min-w-0 truncate font-bold">{latest.new_name}</span>
                            <span className="text-sm text-ink-soft">{timeAgo(latest.processed_at)}</span>
                          </div>
                        ) : (
                          <p className="mt-1.5 text-sm text-ink-soft">
                            Nothing yet — drop an image into {me.config.rawFolderName} and it’ll appear here.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* At a glance */}
                  <section className="dash-card flex flex-col rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8">
                    <h2 className="text-2xl font-bold">At a glance</h2>
                    <p className="mb-6 mt-1 text-sm text-ink-soft">
                      From your latest {plural(activity.length, 'file', 'files')}
                    </p>
                    <dl className="grid flex-1 grid-cols-3 gap-3 lg:grid-cols-1">
                      <div className="rounded-2xl bg-sage-soft p-3 sm:p-4">
                        <dt className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">Organized</dt>
                        <dd className="font-display text-3xl font-bold">
                          <AnimatedNumber value={counts.completed} />
                        </dd>
                      </div>
                      <div className="rounded-2xl bg-butter-soft p-3 sm:p-4">
                        <dt className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">In progress</dt>
                        <dd className="font-display text-3xl font-bold">
                          <AnimatedNumber value={counts.processing} />
                        </dd>
                      </div>
                      <div className="rounded-2xl bg-rose-soft p-3 sm:p-4">
                        <dt className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">Failed</dt>
                        <dd className="font-display text-3xl font-bold">
                          <AnimatedNumber value={counts.failed} />
                        </dd>
                      </div>
                    </dl>
                  </section>

                  {/* Raw folder */}
                  <section className="dash-card rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8 lg:col-span-2">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                      <div
                        className={`raw-icon flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl ${
                          raw && raw.waiting > 0 ? 'bg-butter' : raw && raw.total === 0 ? 'bg-sage' : 'bg-lavender-soft'
                        }`}
                      >
                        {syncing ? (
                          <Sparkles className="h-7 w-7 text-ink" />
                        ) : raw && raw.waiting === 0 && raw.failed === 0 && raw.processing === 0 ? (
                          <CircleCheck className="h-7 w-7 text-ink" />
                        ) : (
                          <Images className="h-7 w-7 text-ink" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h2 className="text-2xl font-bold">
                          {rawError
                            ? 'Couldn’t check your Raw folder'
                            : !raw
                              ? 'Checking your Raw folder…'
                              : syncing
                                ? 'Organizing your Raw folder…'
                                : raw.waiting > 0
                                  ? `${plural(raw.waiting, 'image', 'images')} waiting`
                                  : raw.failed > 0
                                    ? 'Some images need another try'
                                    : 'Raw folder is all clear'}
                        </h2>
                        <p className="mt-1 text-ink-soft">
                          {rawError
                            ? rawError
                            : !raw
                              ? 'Looking for images that haven’t been organized yet.'
                              : syncing
                                ? `${plural(remaining, 'image', 'images')} left to tag, rename and move.`
                                : raw.waiting > 0
                                  ? `Sitting in ${me.config.rawFolderName}, not organized yet. Nothing moves until you say so.`
                                  : raw.failed > 0
                                    ? `${plural(raw.failed, 'image', 'images')} in ${me.config.rawFolderName} couldn’t be processed.`
                                    : `No unorganized images in ${me.config.rawFolderName}.`}
                        </p>
                        {raw && !syncing && raw.waiting > 0 && raw.failed > 0 && (
                          <p className="mt-1 text-sm font-bold text-rose-ink">
                            Plus {plural(raw.failed, 'image', 'images')} that failed earlier.
                          </p>
                        )}
                      </div>

                      {raw && !syncing && (raw.waiting > 0 || raw.failed > 0) && (
                        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                          {raw.waiting > 0 && (
                            <Button size="lg" magnetic onClick={() => handleOrganize(false)} disabled={organizeBusy}>
                              {organizeBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                              Organize now
                            </Button>
                          )}
                          {raw.failed > 0 && (
                            <Button
                              variant={raw.waiting > 0 ? 'ghost' : 'secondary'}
                              size={raw.waiting > 0 ? 'sm' : 'md'}
                              onClick={() => handleOrganize(true)}
                              disabled={organizeBusy}
                            >
                              <RotateCcw className="h-4 w-4" /> Retry {raw.waiting > 0 ? 'failed too' : plural(raw.failed, 'image', 'images')}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {syncing && (
                      <div className="mt-6">
                        <div className="h-3 overflow-hidden rounded-full bg-lavender-soft" role="progressbar" aria-label="Organizing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}>
                          <div className="progress-fill h-full w-full origin-left rounded-full bg-gradient-to-r from-lavender to-periwinkle" />
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Connection */}
                  <section className="dash-card flex flex-col rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-periwinkle-soft">
                        <HardDrive className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="text-xl font-bold">Google Drive</h2>
                        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-sage-deep">
                          <Check className="h-3.5 w-3.5" strokeWidth={3} /> Connected
                        </p>
                      </div>
                    </div>
                    <p className="mb-5 text-sm leading-relaxed text-ink-soft">
                      Disconnecting stops sorting, revokes DriveTag’s access at Google, and deletes the stored token. Your
                      files stay exactly where they are.
                    </p>
                    <div className="mt-auto">
                      <Button variant="secondary" size="sm" onClick={() => setConfirmDisconnect(true)}>
                        <Unplug className="h-4 w-4" /> Disconnect
                      </Button>
                    </div>
                  </section>

                  {/* Recent activity */}
                  <section className="dash-card rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8 lg:col-span-3">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <h2 className="text-2xl font-bold">Recent activity</h2>
                      {busy && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-butter-soft px-3 py-1 text-xs font-bold">
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Updating live
                        </span>
                      )}
                    </div>
                    {activity.length === 0 ? (
                      <div className="flex flex-col items-center py-10 text-center">
                        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-lavender-soft">
                          <ImageUp className="h-9 w-9 text-lavender-deep" />
                        </div>
                        <h3 className="mb-2 text-xl font-semibold">No files yet</h3>
                        <p className="max-w-sm leading-relaxed text-ink-soft">
                          Drop an image into <strong className="text-ink">{me.config.rawFolderName}</strong> and it’ll show up
                          here — tagged, renamed, and filed.
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-line">
                        {activity.map((entry) => {
                          const style = STATUS_STYLES[entry.status];
                          const tags = [entry.tags?.genre, entry.tags?.subject, entry.tags?.style].filter(Boolean) as string[];
                          return (
                            <li
                              key={entry.file_id}
                              data-file-id={entry.file_id}
                              className="activity-row flex flex-col gap-3 rounded-2xl px-2 py-4 transition-colors hover:bg-canvas sm:flex-row sm:items-center"
                            >
                              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${style.bubble}`} title={style.label}>
                                {entry.status === 'completed' ? (
                                  <Check className="h-4 w-4" strokeWidth={3} />
                                ) : entry.status === 'processing' ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CircleAlert className="h-4 w-4 text-rose-ink" />
                                )}
                                <span className="sr-only">{style.label}</span>
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-bold">{entry.new_name ?? entry.original_name ?? entry.file_id}</p>
                                {entry.status === 'failed' && entry.error_message ? (
                                  <p className="truncate text-sm font-semibold text-rose-ink">{entry.error_message}</p>
                                ) : (
                                  entry.new_name &&
                                  entry.original_name && <p className="truncate text-sm text-ink-soft">was {entry.original_name}</p>
                                )}
                              </div>
                              {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {tags.map((tag, i) => (
                                    <span key={`${tag}-${i}`} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TAG_TINTS[i]}`}>
                                      {displayTag(tag)}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <span className="shrink-0 text-sm font-semibold text-ink-soft sm:w-28 sm:text-right">
                                {timeAgo(entry.processed_at)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  {/* Plan */}
                  {me.subscription && (
                    <section className="dash-card flex flex-col gap-4 rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-8 lg:col-span-3">
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h2 className="text-2xl font-bold">Plan</h2>
                          {me.subscription.status === 'trialing' ? (
                            <span className="rounded-full bg-butter px-3 py-0.5 text-xs font-extrabold">Free trial</span>
                          ) : (
                            <span className="rounded-full bg-lavender-soft px-3 py-0.5 text-xs font-extrabold capitalize">
                              {me.subscription.status.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <p className="text-ink-soft">
                          {me.subscription.status === 'trialing'
                            ? trialDays === null
                              ? 'Your trial is active.'
                              : `${plural(trialDays, 'day', 'days')} left in your trial.`
                            : `Plan: ${me.subscription.plan ?? 'Standard'}.`}
                        </p>
                        {!me.entitled && (
                          <p className="mt-1 text-sm font-bold text-rose-ink">Tagging is paused until your plan is active again.</p>
                        )}
                      </div>
                      <Button variant="secondary" disabled title="Billing isn’t set up yet — no payment provider is connected">
                        <CreditCard className="h-4 w-4" /> Billing — coming soon
                      </Button>
                    </section>
                  )}
                </div>
              )
            )}
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Google Drive?"
        confirmLabel={disconnecting ? 'Disconnecting…' : 'Disconnect'}
        busy={disconnecting}
        onConfirm={handleDisconnect}
        onCancel={closeDisconnect}
      >
        DriveTag will stop sorting, revoke its access at Google, and delete the stored token. Nothing in your Drive is moved or
        deleted. You can reconnect any time.
      </ConfirmDialog>
    </div>
  );
}
