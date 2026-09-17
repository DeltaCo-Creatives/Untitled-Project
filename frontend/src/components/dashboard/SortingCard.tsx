import { useRef, useState } from 'react';
import { CircleAlert, Info, LoaderCircle, Radio, Workflow } from 'lucide-react';
import { api, type ActivityEntry, type MeResponse, type ProcessesStatus } from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { errorMessage, friendlyWatchError } from '../../lib/messages';
import { plural, timeAgo } from '../../lib/format';
import { Switch } from '../ui/Switch';
import { watchStateOf, type WatchState } from './useDashboardData';

interface SortingCardProps {
  me: MeResponse;
  status: ProcessesStatus | null;
  /** The most recent organized file, for the "Latest organized" strip. */
  latest: ActivityEntry | undefined;
  /** Re-fetch the dashboard after the watch changes. */
  onChanged: () => Promise<void>;
  className?: string;
}

/** Account-level automatic sorting: one Drive watch covers every work process. */
export function SortingCard({ me, status, latest, onChanged, className = '' }: SortingCardProps) {
  const ref = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchState = watchStateOf(me);
  const sortingActive = watchState === 'live' || watchState === 'polling';
  const { active, total } = me.processCounts;
  const canStart = active > 0;
  const syncing = Boolean(status?.syncing);

  const watchCopy: Record<WatchState, { title: string; detail: string | null }> = {
    live: {
      title: 'Live — Google Drive tells DriveTag the moment a file lands',
      detail: me.watchExpiresAt ? `Watch channel active until ${new Date(me.watchExpiresAt).toLocaleString()}` : null,
    },
    polling: {
      title: me.autoSyncSeconds
        ? `Checking your Raw folders every ${me.autoSyncSeconds} seconds`
        : 'Waiting for the server’s folder check to be switched on',
      detail: me.autoSyncSeconds
        ? 'Live updates need a public, verified web address, so DriveTag checks on a timer instead.'
        : 'Set AUTO_SYNC_INTERVAL_SECONDS on the backend, or pause and restart once webhooks are set up.',
    },
    expired: {
      title: 'Watch expired — new images aren’t being picked up',
      detail: 'Turn automatic sorting on again to restart it.',
    },
    off: { title: 'Paused — new images won’t be sorted', detail: null },
  };

  const toggle = async (next: boolean) => {
    if (next && !canStart) return;
    setBusy(true);
    setError(null);
    try {
      if (next) await api.startWatch();
      else await api.stopWatch();
      await onChanged();
    } catch (err) {
      setError(friendlyWatchError(errorMessage(err, 'Couldn’t update automatic sorting')));
    } finally {
      setBusy(false);
    }
  };

  // A slow "breathing" radar icon while sorting is on.
  useGSAP(
    () => {
      const icon = ref.current?.querySelector('.sorting-icon');
      if (!icon || !sortingActive) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(icon, { scale: 1.08, rotation: -6, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      });
      return () => mm.revert();
    },
    { dependencies: [sortingActive], scope: ref, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const alert = ref.current?.querySelector('.sorting-alert');
      if (!alert) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(alert, { y: -8, autoAlpha: 0, duration: 0.3 });
        gsap.to(alert, { keyframes: { x: [0, -8, 7, -4, 0] }, duration: 0.45 });
      });
      return () => mm.revert();
    },
    { dependencies: [error], scope: ref, revertOnUpdate: true },
  );

  const copy = watchCopy[watchState];
  const switchNote = !sortingActive && !canStart;

  return (
    <section
      ref={ref}
      aria-labelledby="sorting-heading"
      className={`flex flex-col rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8 ${className}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`sorting-icon hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:flex ${
            sortingActive ? 'bg-sage' : watchState === 'expired' ? 'bg-rose' : 'bg-lavender-soft'
          }`}
          aria-hidden
        >
          <Radio className="h-6 w-6 text-ink" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="sorting-heading" className="text-2xl font-bold">
            Automatic sorting
          </h2>
          <p className="mt-1 inline-flex items-start gap-2 text-sm font-bold text-ink-soft" aria-live="polite">
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
            {copy.title}
          </p>
          {copy.detail && <p className="mt-1 pl-[1.125rem] text-xs text-ink-soft">{copy.detail}</p>}
        </div>
        <Switch
          checked={sortingActive}
          onChange={toggle}
          label={sortingActive ? 'Turn off automatic sorting' : 'Turn on automatic sorting'}
          busy={busy}
          disabled={switchNote}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-lavender-soft px-3 py-1 text-xs font-bold">
          <Workflow className="h-3.5 w-3.5" aria-hidden />
          {total === 0
            ? 'No work processes yet'
            : active === total
              ? `Covers ${plural(active, 'work process', 'work processes')}`
              : `Covers ${active} of ${plural(total, 'work process', 'work processes')}`}
        </span>
        {syncing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-butter-soft px-3 py-1 text-xs font-bold">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            {status?.kind === 'organize' ? 'Organizing now' : 'Sorting new images'}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        One Google Drive watch covers all your work processes. Images dropped into the Raw folder of any process that’s
        switched on get tagged, renamed and filed.
      </p>

      {switchNote && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-butter-soft px-4 py-3 text-sm font-semibold">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          <span>
            <strong className="font-extrabold">Turn on a process first.</strong>{' '}
            {total === 0
              ? 'Create a work process, then switch automatic sorting on.'
              : 'Automatic sorting needs at least one work process that’s switched on and within your plan.'}
          </span>
        </p>
      )}
      {sortingActive && !canStart && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-butter-soft px-4 py-3 text-sm font-semibold">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          No work process is switched on, so nothing is being sorted right now.
        </p>
      )}
      {sortingActive && canStart && me.usage?.exhausted && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-butter-soft px-4 py-3 text-sm font-semibold">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          You’re out of images, so new ones wait in Raw. “Organize now” sorts them once you have more.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="sorting-alert mt-4 flex items-start gap-2 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="pt-6 lg:mt-auto">
        <div className="rounded-2xl border border-dashed border-line p-4">
          <p className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">Latest organized</p>
          {latest?.new_name ? (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="min-w-0 break-all font-bold">{latest.new_name}</span>
              <span className="text-sm text-ink-soft">{timeAgo(latest.processed_at)}</span>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-ink-soft">
              Nothing yet — drop an image into a Raw folder and it’ll appear here.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
