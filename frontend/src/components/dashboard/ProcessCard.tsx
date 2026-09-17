import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  CircleAlert,
  CircleCheck,
  CirclePause,
  FolderCheck,
  FolderInput,
  Images,
  Info,
  LoaderCircle,
  Lock,
  Pencil,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
  type CurrentPlan,
  type OrganizeResponse,
  type ProcessStatusEntry,
  type Usage,
  type WorkProcess,
} from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { errorMessage, isPlanLimitError, usageSummary } from '../../lib/messages';
import { formatCount, plural } from '../../lib/format';
import { Button, ButtonLink } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ProgressBar } from '../ui/ProgressBar';
import { Switch } from '../ui/Switch';
import { isCountsEntry, type OrganizeProgress } from './useDashboardData';

const MAX_DESTINATION_CHIPS = 4;

interface ProcessCardProps {
  process: WorkProcess;
  /** Raw folder counts from /api/processes/status; undefined until the first check lands. */
  entry: ProcessStatusEntry | undefined;
  /** The latest Raw folder check failed, so a missing entry won't arrive on its own. */
  statusFailed: boolean;
  plan: CurrentPlan | null;
  usage: Usage | null;
  /** Automatic sorting (the account's Drive watch) is on. */
  sortingActive: boolean;
  /** This process is being organized right now. */
  organizing: boolean;
  /** Another run holds the account's single sorting slot. */
  busyElsewhere: boolean;
  /** Determinate progress when this tab started the run. */
  progress: OrganizeProgress | null;
  onOrganizeStarted: (processId: string, response: OrganizeResponse, retryFailed: boolean) => void;
  onProcessChanged: (process: WorkProcess) => void;
  onReload: () => Promise<void>;
}

interface CardMessage {
  tone: 'rose' | 'butter';
  text: string;
  /** Offer a way to the Plans page. */
  upgrade?: boolean;
}

interface PendingOrganize {
  retryFailed: boolean;
  waiting: number;
  remaining: number;
}

const linkClass =
  'rounded font-extrabold text-ink underline decoration-lavender decoration-2 underline-offset-2 hover:decoration-lavender-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60';

export function ProcessCard({
  process,
  entry,
  statusFailed,
  plan,
  usage,
  sortingActive,
  organizing,
  busyElsewhere,
  progress,
  onOrganizeStarted,
  onProcessChanged,
  onReload,
}: ProcessCardProps) {
  const ref = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const [toggling, setToggling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState<PendingOrganize | null>(null);
  const [message, setMessage] = useState<CardMessage | null>(null);

  const counts = isCountsEntry(entry) ? entry : null;
  const folderError = entry && 'error' in entry ? entry.error : null;
  const waiting = counts?.waiting ?? 0;
  const failed = counts?.failed ?? 0;

  const regular = process.destinations.filter((destination) => !destination.isFallback);
  const fallback = process.destinations.find((destination) => destination.isFallback);
  const shown = regular.slice(0, MAX_DESTINATION_CHIPS);
  const hidden = regular.length - shown.length;

  const flowing = process.active && (sortingActive || organizing);
  const canOrganize = process.active && !organizing && !busyElsewhere && !starting && !folderError;
  const rawName = process.rawFolderName ?? 'Raw folder';
  const masterName = process.masterFolderName ?? 'Master folder';
  // New arrivals get sorted on their own; "Organize now" is only for images that were already waiting.
  const autoSorting = sortingActive && !usage?.exhausted;
  const promoteOrganize = waiting > 0 && canOrganize && !autoSorting;

  // ------------------------------------------------------------------ actions

  const organize = async (retryFailed: boolean) => {
    setStarting(true);
    setMessage(null);
    try {
      const result = await api.processes.organize(process.id, retryFailed);
      setPending(null);
      if (result.started) {
        onOrganizeStarted(process.id, result, retryFailed);
      } else {
        setMessage({ tone: 'butter', text: result.reason ?? 'DriveTag couldn’t start organizing just now. Try again in a moment.' });
      }
      await onReload();
    } catch (err) {
      setPending(null);
      if (err instanceof ApiError && err.status === 402) {
        setMessage({ tone: 'butter', text: err.message, upgrade: isPlanLimitError(err) });
        // Images may have run out since the page loaded: catch the usage card up too.
        void onReload();
      } else if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        // Locked, paused or deleted since the page last loaded: show why, and catch the card up.
        setMessage({ tone: 'rose', text: err.message, upgrade: err.code === 'process_locked' });
        void onReload();
      } else {
        setMessage({ tone: 'rose', text: errorMessage(err, 'Couldn’t start organizing') });
      }
    } finally {
      setStarting(false);
      // The button that opened the dialog is disabled while the run starts, so focus falls to <body>.
      // Put keyboard users on the status that now describes what happened.
      setTimeout(() => {
        if (!document.activeElement || document.activeElement === document.body) {
          statusRef.current?.focus({ preventScroll: true });
        }
      }, 0);
    }
  };

  const requestOrganize = (retryFailed: boolean) => {
    setMessage(null);
    if (usage?.exhausted) {
      setMessage({
        tone: 'butter',
        text: `${usageSummary(plan, usage)} New images wait safely in Raw until then.`,
        upgrade: true,
      });
      return;
    }
    const count = waiting + (retryFailed ? failed : 0);
    if (usage && count > usage.remaining) {
      setPending({ retryFailed, waiting: count, remaining: usage.remaining });
      return;
    }
    void organize(retryFailed);
  };

  const toggleEnabled = async (next: boolean) => {
    setToggling(true);
    setMessage(null);
    try {
      const { process: updated } = await api.processes.setEnabled(process.id, next);
      onProcessChanged(updated);
      await onReload();
    } catch (err) {
      setMessage({
        tone: 'rose',
        text: errorMessage(err, next ? 'Couldn’t turn this process on' : 'Couldn’t pause this process'),
        upgrade: err instanceof ApiError && err.code === 'process_locked',
      });
      // Locked or deleted elsewhere: the card is out of date, so refresh it.
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) void onReload();
    } finally {
      setToggling(false);
    }
  };

  // ---------------------------------------------------------------- animation

  // Dots travel Raw → Master while this process is sorting.
  useGSAP(
    () => {
      if (!ref.current || !flowing) return;
      const root = ref.current;
      const mm = gsap.matchMedia();
      mm.add(`${MOTION_OK} and (min-width: 640px)`, () => {
        const track = root.querySelector<HTMLElement>('.flow-track');
        if (!track) return;
        gsap.utils.toArray<HTMLElement>('.flow-dot', root).forEach((dot, i) => {
          gsap
            // repeatRefresh re-measures the track each loop, so a resize doesn't strand the dots.
            .timeline({ repeat: -1, repeatRefresh: true, delay: i * 0.6 })
            .fromTo(dot, { x: 0 }, { x: () => track.clientWidth - dot.offsetWidth, duration: 1.8, ease: 'sine.inOut' })
            .fromTo(dot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, 0)
            .to(dot, { autoAlpha: 0, duration: 0.25 }, 1.55);
        });
      });
      return () => mm.revert();
    },
    { dependencies: [flowing], scope: ref, revertOnUpdate: true },
  );

  // A gentle bob on the Raw icon while images wait for "Organize now".
  const waitingIdle = waiting > 0 && process.active && !organizing;
  useGSAP(
    () => {
      const icon = ref.current?.querySelector('.raw-icon');
      if (!icon || !waitingIdle) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(icon, { y: -4, rotation: -8, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      });
      return () => mm.revert();
    },
    { dependencies: [waitingIdle], scope: ref, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const note = ref.current?.querySelector('.card-message');
      if (!note || !message) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(note, { y: -8, autoAlpha: 0, duration: 0.35, ease: 'back.out(1.8)' });
        if (message.tone === 'rose') gsap.to(note, { keyframes: { x: [0, -8, 7, -4, 0] }, duration: 0.45 });
      });
      return () => mm.revert();
    },
    { dependencies: [message], scope: ref, revertOnUpdate: true },
  );

  // ------------------------------------------------------------------- render

  const checkFailed = !counts && !folderError && statusFailed;
  // The server's error already opens with the title's sentence; don't say it twice.
  const folderErrorDetail = folderError?.replace(/^DriveTag couldn['’]t open this Raw folder\.?\s*/i, '') ?? '';

  const statusTitle = folderError
    ? 'DriveTag couldn’t open this Raw folder'
    : !counts
      ? checkFailed
        ? 'Couldn’t check the Raw folder'
        : 'Checking the Raw folder…'
      : organizing
        ? progress
          ? `Organizing… ${formatCount(progress.done)} of ${formatCount(progress.total)} done`
          : 'Organizing images in Raw…'
        : waiting > 0
          ? `${plural(waiting, 'image', 'images')} waiting`
          : counts.processing > 0
            ? `${plural(counts.processing, 'image', 'images')} being sorted`
            : failed > 0
              ? `${plural(failed, 'image', 'images')} couldn’t be sorted`
              : 'Raw folder is all clear';

  const statusDetail = folderError
    ? `${folderErrorDetail} Edit the process to pick another Raw folder.`.trim()
    : !counts
      ? checkFailed
        ? 'DriveTag will look again on the next refresh.'
        : 'Looking for images that haven’t been organized yet.'
      : organizing
        ? 'Tagging, renaming and filing. You can leave this page; it keeps going.'
        : waiting > 0
          ? process.locked
            ? `Sitting in ${rawName}. They’ll wait until this process is within your plan.`
            : !process.enabled
              ? `Sitting in ${rawName}. Switch this process on to sort them.`
              : autoSorting
                ? `New images in ${rawName} get sorted automatically. Organize now handles ones that were already waiting.`
                : `Sitting in ${rawName}, not organized yet. Nothing moves until you say so.`
          : counts.processing > 0
            ? 'Automatic sorting is working through them.'
            : failed > 0
              ? `Still in ${rawName}. Retry to give them another go.`
              : `No unorganized images in ${rawName}.`;

  const disabledReason =
    organizing || folderError || process.locked
      ? null
      : !process.enabled
        ? 'Paused — switch it on to organize.'
        : busyElsewhere
          ? 'DriveTag is busy with another run. Organize now frees up when it finishes.'
          : null;

  const badges = [
    !process.enabled && { key: 'paused', label: 'Paused', className: 'bg-line text-ink-soft', icon: CirclePause },
    process.locked && { key: 'locked', label: 'Over plan limit', className: 'bg-rose text-rose-ink', icon: Lock },
    organizing && { key: 'busy', label: 'Busy', className: 'bg-butter text-ink', icon: LoaderCircle },
  ].filter((badge) => badge !== false);

  const switchLabel = process.locked
    ? `“${process.name}” is over your plan’s limit and can’t be switched on`
    : process.enabled
      ? `Pause “${process.name}”`
      : `Switch on “${process.name}”`;

  return (
    <article
      ref={ref}
      aria-labelledby={headingId}
      aria-busy={organizing}
      className={`process-card dash-item flex flex-col rounded-[2rem] border bg-white p-6 shadow-soft transition-colors sm:p-8 ${
        organizing ? 'border-butter' : process.locked ? 'border-dashed border-rose' : 'border-line'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="truncate text-xl font-bold sm:text-2xl" title={process.name}>
            {process.name}
          </h3>
          {badges.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Status">
              {badges.map(({ key, label, className, icon: Icon }) => (
                <li key={key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${className}`}>
                  <Icon
                    className={`h-3.5 w-3.5 ${key === 'busy' ? 'animate-spin motion-reduce:animate-none' : ''}`}
                    aria-hidden
                  />
                  {label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span
          className="shrink-0"
          title={
            process.locked
              ? 'Over your plan’s process limit. Upgrade, or delete another process, to switch this one on.'
              : undefined
          }
        >
          <Switch
            size="sm"
            checked={process.enabled && !process.locked}
            onChange={toggleEnabled}
            label={switchLabel}
            busy={toggling}
            disabled={process.locked}
          />
        </span>
      </div>

      {/* Raw → Master → destinations */}
      <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 rounded-2xl bg-butter-soft px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-soft">
            <FolderInput className="raw-icon h-4 w-4 text-ink" aria-hidden /> Raw
          </p>
          <p className="truncate font-bold" title={rawName}>
            {rawName}
          </p>
        </div>
        <div
          className="flow-track relative hidden h-2 w-10 shrink-0 overflow-hidden rounded-full bg-lavender-soft sm:block lg:w-8 xl:w-12"
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="flow-dot invisible absolute left-0 top-0 h-2 w-2 rounded-full bg-lavender-deep opacity-0" />
          ))}
        </div>
        <ArrowDown className="mx-auto h-4 w-4 text-lavender-deep sm:hidden" aria-hidden />
        <div className="min-w-0 flex-1 rounded-2xl bg-sage-soft px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-soft">
            <FolderCheck className="h-4 w-4 text-ink" aria-hidden /> Master
          </p>
          <p className="truncate font-bold" title={masterName}>
            {masterName}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-soft">Sorts into</p>
        <ul className="flex flex-wrap gap-1.5" aria-label={`Destinations of ${process.name}`}>
          {shown.map((destination) => (
            <li
              key={destination.id}
              title={destination.description || destination.name}
              className="max-w-[12rem] truncate rounded-full bg-periwinkle-soft px-2.5 py-1 text-xs font-bold"
            >
              {destination.name}
            </li>
          ))}
          {hidden > 0 && (
            <li
              title={regular
                .slice(MAX_DESTINATION_CHIPS)
                .map((destination) => destination.name)
                .join(', ')}
              className="rounded-full bg-lavender-soft px-2.5 py-1 text-xs font-extrabold"
            >
              +{formatCount(hidden)} more
            </li>
          )}
          {fallback && (
            <li
              title="For images that fit none of the other destinations"
              className="max-w-[12rem] truncate rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-bold text-ink-soft"
            >
              {fallback.name}
            </li>
          )}
          {regular.length === 0 && !fallback && <li className="text-xs text-ink-soft">No destinations yet</li>}
        </ul>
      </div>

      {process.locked && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-semibold">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-ink" aria-hidden />
          <span>
            Your {plan?.label ?? 'current'} plan includes{' '}
            {plan ? plural(plan.maxProcesses, 'work process', 'work processes') : 'fewer work processes'}, so this one can’t
            run. You can still edit or delete it.{' '}
            <Link to="/plans" className={linkClass}>
              See plans
            </Link>
          </span>
        </p>
      )}

      {/* Raw folder status */}
      <div
        ref={statusRef}
        tabIndex={-1}
        className={`mt-4 rounded-2xl p-4 focus:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 ${folderError ? 'border border-rose bg-rose-soft' : 'border border-dashed border-line'}`}
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
              folderError
                ? 'bg-rose'
                : !counts || organizing
                  ? 'bg-lavender-soft'
                  : waiting > 0
                    ? 'bg-butter'
                    : failed > 0
                      ? 'bg-rose-soft'
                      : 'bg-sage'
            }`}
            aria-hidden
          >
            {folderError ? (
              <CircleAlert className="h-5 w-5 text-rose-ink" />
            ) : checkFailed ? (
              <CircleAlert className="h-5 w-5 text-ink-soft" />
            ) : !counts ? (
              <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            ) : organizing ? (
              <Sparkles className="h-5 w-5" />
            ) : waiting > 0 || counts.processing > 0 ? (
              <Images className="h-5 w-5" />
            ) : failed > 0 ? (
              <CircleAlert className="h-5 w-5 text-rose-ink" />
            ) : (
              <CircleCheck className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`font-bold ${folderError ? 'text-rose-ink' : ''}`}>{statusTitle}</p>
            <p className={`mt-0.5 text-sm ${folderError ? 'text-rose-ink' : 'text-ink-soft'}`}>{statusDetail}</p>
            {counts && !organizing && waiting > 0 && failed > 0 && (
              <p className="mt-1 text-sm font-bold text-rose-ink">Plus {plural(failed, 'image', 'images')} that failed earlier.</p>
            )}
          </div>
        </div>
        {organizing && (
          <ProgressBar
            className="mt-4"
            size="sm"
            progress={progress ? progress.progress : null}
            label={`Organizing ${process.name}`}
          />
        )}
      </div>

      {message && (
        <div
          role={message.tone === 'rose' ? 'alert' : 'status'}
          className={`card-message mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            message.tone === 'rose' ? 'border-rose bg-rose-soft text-rose-ink' : 'border-butter bg-butter-soft'
          }`}
        >
          {message.tone === 'rose' ? (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p>{message.text}</p>
            {message.upgrade && (
              <ButtonLink to="/plans" size="sm" className="mt-2">
                <Sparkles className="h-4 w-4" aria-hidden /> See plans
              </ButtonLink>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMessage(null)}
            aria-label="Dismiss message"
            className="rounded-lg p-0.5 text-current opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-5 lg:mt-auto">
        <Button
          variant={promoteOrganize ? 'primary' : 'secondary'}
          size="sm"
          magnetic={promoteOrganize}
          onClick={() => requestOrganize(false)}
          disabled={!canOrganize}
        >
          {starting ? (
            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          Organize now
          <span className="sr-only"> for {process.name}</span>
        </Button>
        {failed > 0 && !organizing && (
          <Button variant="ghost" size="sm" onClick={() => requestOrganize(true)} disabled={!canOrganize}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Retry failed
            <span className="sr-only"> for {process.name}</span>
          </Button>
        )}
        <ButtonLink to={`/processes/${process.id}`} variant="ghost" size="sm" className="ml-auto">
          <Pencil className="h-4 w-4" aria-hidden /> Edit
          <span className="sr-only"> {process.name}</span>
        </ButtonLink>
      </div>
      {disabledReason && <p className="mt-2 text-xs font-semibold text-ink-soft">{disabledReason}</p>}

      {/* Portaled: the card's entrance transform would otherwise trap the fixed-position dialog inside it. */}
      {pending &&
        createPortal(
          <ConfirmDialog
            open
            title="Not enough images for all of them"
            tone="primary"
            confirmLabel={starting ? 'Starting…' : `Organize ${formatCount(pending.remaining)}`}
            busy={starting}
            onConfirm={() => void organize(pending.retryFailed)}
            onCancel={() => setPending(null)}
          >
            <p>
              You have {plural(pending.remaining, 'image', 'images')} left. DriveTag will organize{' '}
              {formatCount(pending.remaining)} of the {formatCount(pending.waiting)} waiting; the rest stay in Raw.
            </p>
            <p className="mt-3 text-sm">
              {plan?.id === 'free'
                ? 'The rest get sorted with “Organize now” once you upgrade or add an image pack.'
                : 'The rest get sorted with “Organize now” once your images refill or you add an image pack.'}
            </p>
          </ConfirmDialog>,
          document.body,
        )}
    </article>
  );
}
