import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CircleAlert, Info, LogOut, PlugZap, RefreshCw, Settings, TriangleAlert, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { gsap, useGSAP, SplitText, MOTION_OK } from '../lib/gsap';
import { plural } from '../lib/format';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Logo } from '../components/ui/Logo';
import { Button, ButtonLink } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useDashboardData, watchStateOf } from '../components/dashboard/useDashboardData';
import { SortingCard } from '../components/dashboard/SortingCard';
import { UsageCard } from '../components/dashboard/UsageCard';
import { ProcessesSection } from '../components/dashboard/ProcessesSection';
import { StatsCard } from '../components/dashboard/StatsCard';
import { ConnectionCard } from '../components/dashboard/ConnectionCard';
import { AccountCard } from '../components/dashboard/AccountCard';
import { ActivityList } from '../components/dashboard/ActivityList';
import { BetaSignupsCard } from '../components/dashboard/BetaSignupsCard';

/** Google expires a Drive refresh token 7 days after issue while the OAuth app is in Testing status. */
const DRIVE_REVERIFY_WARNING_DAYS = 5;

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);

  const {
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
    reload,
    refresh,
    retry,
    replaceProcess,
    trackOrganize,
  } = useDashboardData();

  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );

  // The notice is one-time: drop it from history so a reload doesn't show it again.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const view = loading ? 'loading' : !me ? 'error' : me.driveConnected ? 'ready' : 'setup';
  const watchState = watchStateOf(me);
  const sortingActive = watchState === 'live' || watchState === 'polling';
  const syncing = Boolean(status?.syncing);
  const hasProcesses = processes.length > 0;
  const imagesExhausted = Boolean(me?.usage?.images?.exhausted);
  const documentsExhausted = Boolean(me?.usage?.documents?.exhausted);
  const exhausted = imagesExhausted || documentsExhausted;
  // Only names the kind(s) that actually ran out, so an account that only sorts one kind never hears about the other.
  const exhaustedKinds = [imagesExhausted && 'images', documentsExhausted && 'documents'].filter(Boolean).join(' and ');
  const organizingProcess =
    syncing && status?.kind === 'organize' ? processes.find((process) => process.id === status.activeProcessId) : undefined;
  const live = syncing || Object.keys(runs).length > 0 || activity.some((entry) => entry.status === 'processing');
  const latest = activity.find((entry) => entry.status === 'completed' && entry.new_name);

  // While Google's OAuth app is in Testing status, a Drive refresh token expires after 7 days. Only meaningful
  // once Drive is actually connected and we know when — an older backend omits driveConnectedAt (normalized to null).
  const daysSinceDriveConnect =
    me?.googleAppTesting && me.driveConnected && me.driveConnectedAt ? daysSince(me.driveConnectedAt) : null;
  const driveReverifySoon = daysSinceDriveConnect !== null && daysSinceDriveConnect >= DRIVE_REVERIFY_WARNING_DAYS;

  const fullName = user?.user_metadata?.full_name as string | undefined;
  const firstName = fullName?.trim().split(/\s+/)[0];

  // Once the page has data, a failed poll or Raw folder check shows as a banner rather than replacing the page.
  const bannerError = me ? (loadError ?? (statusError ? `Couldn’t check your Raw folders: ${statusError}` : null)) : null;

  const statusLine =
    view === 'setup'
      ? 'Let’s finish setting things up.'
      : !hasProcesses
        ? 'Create a work process to start sorting.'
        : syncing
          ? status?.kind === 'organize'
            ? organizingProcess
              ? `DriveTag is organizing ${organizingProcess.name} right now.`
              : 'DriveTag is organizing your Raw folders right now.'
            : 'DriveTag is sorting new files right now.'
          : exhausted
            ? `You’re out of ${exhaustedKinds}, so new ones are waiting in Raw.`
            : sortingActive
              ? me && me.processCounts.active > 0
                ? 'DriveTag is quietly organizing your Drive.'
                : 'Automatic sorting is on, but no work process is switched on.'
              : 'Automatic sorting is off.';

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
        const items = gsap.utils.toArray<HTMLElement>('.dash-item', root);
        if (items.length > 0) {
          gsap.from(items, {
            y: 36,
            scale: 0.97,
            autoAlpha: 0,
            // Many processes shouldn't make the page take seconds to appear.
            stagger: Math.min(0.08, 0.9 / items.length),
            duration: 0.7,
            ease: 'back.out(1.5)',
          });
        }
        const plug = root.querySelector('.setup-icon');
        if (plug) gsap.to(plug, { rotation: 12, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut', repeatDelay: 1.2 });
      });
      return () => mm.revert();
    },
    { dependencies: [view], scope: pageRef, revertOnUpdate: true },
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

  const processesSection = (
    <ProcessesSection
      processes={processes}
      limit={limit}
      status={status}
      statusFailed={Boolean(statusError)}
      runs={runs}
      plan={me?.plan ?? null}
      usage={me?.usage ?? null}
      sortingActive={sortingActive}
      onOrganizeStarted={trackOrganize}
      onProcessChanged={replaceProcess}
      onReload={reload}
    />
  );

  // Optional-chained: a backend deployed before work processes has no processCounts, and the setup view must still render.
  const savedProcesses = me?.processCounts?.total ?? 0;

  return (
    <div ref={pageRef} className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-line bg-white/75 backdrop-blur-md">
        <div className="dash-nav mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo to="/dashboard" size="sm" />
          <div className="flex min-w-0 items-center gap-2">
            {user?.email && (
              <span className="hidden min-w-0 items-center gap-2 rounded-full bg-lavender-soft py-1 pl-1 pr-3 text-sm font-bold sm:inline-flex">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lavender font-display text-xs uppercase">
                  {user.email[0]}
                </span>
                <span className="truncate">{user.email}</span>
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        {view === 'loading' ? (
          <div className="space-y-6" role="status" aria-label="Loading your dashboard">
            <Skeleton className="h-10 w-64 max-w-full" />
            <Skeleton className="h-5 w-80 max-w-full" />
            <div className="grid gap-6 lg:grid-cols-3">
              <Skeleton className="h-64 lg:col-span-2" />
              <Skeleton className="h-64" />
            </div>
            <Skeleton className="h-8 w-56 max-w-full" />
            <div className="grid gap-6 lg:grid-cols-2">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          </div>
        ) : view === 'error' ? (
          <div className="dash-item mx-auto max-w-lg rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose" aria-hidden>
              <CircleAlert className="h-8 w-8 text-rose-ink" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">We couldn’t load your dashboard</h1>
            <p role="alert" className="mb-7 leading-relaxed text-ink-soft">
              {loadError}
            </p>
            <Button onClick={retry} size="lg">
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="dash-title break-words text-4xl font-bold tracking-tight sm:text-5xl">
                  {firstName ? `Hello, ${firstName}` : 'Hello there'}
                </h1>
                <p className="mt-2 text-lg text-ink-soft" aria-live="polite">
                  {statusLine}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={refresh} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </Button>
              </div>
            </div>

            {notice && (
              <div
                role="status"
                className="dash-notice mb-6 flex items-start gap-3 rounded-2xl border border-butter bg-butter-soft px-4 py-3 text-sm font-semibold"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
                <span className="flex-1">{notice}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-butter hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
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
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {bannerError}
              </div>
            )}

            {view === 'ready' && driveReverifySoon && (
              <div className="dash-item mb-6 flex flex-col gap-3 rounded-[2rem] border border-butter bg-butter-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-sm font-semibold leading-relaxed text-ink">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  Google expires Drive access every 7 days while DriveTag is in review. Reconnect to keep sorting.
                </p>
                <ButtonLink to="/connect" variant="secondary" size="sm" className="shrink-0">
                  Reconnect Drive
                </ButtonLink>
              </div>
            )}

            {view === 'setup' ? (
              <div className="dash-item mx-auto max-w-xl rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
                <div
                  className="setup-icon mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-lavender to-periwinkle shadow-soft"
                  aria-hidden
                >
                  <PlugZap className="h-9 w-9 text-ink" />
                </div>
                <h2 className="mb-2 text-2xl font-bold">
                  {savedProcesses > 0 ? 'Reconnect your Google Drive' : 'Connect your Google Drive'}
                </h2>
                <p className="mx-auto mb-7 max-w-sm leading-relaxed text-ink-soft">
                  {savedProcesses > 0
                    ? `Your ${plural(savedProcesses, 'work process is', 'work processes are')} saved. Reconnect Drive, then switch automatic sorting back on.`
                    : 'Give DriveTag permission to watch your folders, and it’ll start tagging and sorting new files.'}
                </p>
                <ButtonLink to="/onboarding" size="lg" magnetic>
                  Continue setup
                </ButtonLink>
              </div>
            ) : (
              me && (
                <div className="flex flex-col gap-10">
                  {!hasProcesses && processesSection}

                  <div className="grid gap-6 lg:grid-cols-3">
                    <SortingCard
                      me={me}
                      status={status}
                      latest={latest}
                      onChanged={reload}
                      className="dash-item lg:col-span-2"
                    />
                    <UsageCard
                      plan={me.plan}
                      usage={me.usage}
                      className={`dash-item ${exhausted ? 'order-first lg:order-none' : ''}`}
                    />
                  </div>

                  {hasProcesses && processesSection}

                  <div className="grid gap-6 lg:grid-cols-3">
                    <StatsCard activity={activity} className="dash-item lg:col-span-2" />
                    <div className="flex flex-col gap-6">
                      <ConnectionCard
                        onDisconnected={reload}
                        // Only passed when the warning card above isn't already showing the same fact.
                        daysSinceDriveConnect={!driveReverifySoon ? daysSinceDriveConnect : null}
                        className="dash-item"
                      />
                      <AccountCard className="dash-item" />
                    </div>
                  </div>

                  {me.admin && (
                    <>
                      <div className="dash-item flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-line bg-white px-6 py-4 shadow-soft sm:px-8">
                        <p className="text-sm font-semibold text-ink-soft">Owner tools: payments, the closed beta and account overrides.</p>
                        <ButtonLink to="/admin" variant="secondary" size="sm">
                          <Settings className="h-4 w-4" aria-hidden /> Owner settings
                        </ButtonLink>
                      </div>
                      <BetaSignupsCard className="dash-item" />
                    </>
                  )}

                  <ActivityList activity={activity} processes={processes} live={live} className="dash-item" />
                </div>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
