import { useRef } from 'react';
import { FolderCheck, FolderInput, Info, Plus, Sparkles } from 'lucide-react';
import type { CurrentPlan, OrganizeResponse, ProcessesStatus, Usage, WorkProcess } from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { formatCount, plural } from '../../lib/format';
import { ButtonLink } from '../ui/Button';
import { ProcessCard } from './ProcessCard';
import { isOrganizing, organizeProgress, type OrganizeRuns, type ProcessQuota } from './useDashboardData';

interface ProcessesSectionProps {
  processes: WorkProcess[];
  limit: ProcessQuota | null;
  status: ProcessesStatus | null;
  /** The latest Raw folder check failed. */
  statusFailed: boolean;
  runs: OrganizeRuns;
  plan: CurrentPlan | null;
  usage: Usage | null;
  sortingActive: boolean;
  onOrganizeStarted: (processId: string, response: OrganizeResponse, retryFailed: boolean) => void;
  onProcessChanged: (process: WorkProcess) => void;
  onReload: () => Promise<void>;
}

export function ProcessesSection({
  processes,
  limit,
  status,
  statusFailed,
  runs,
  plan,
  usage,
  sortingActive,
  onOrganizeStarted,
  onProcessChanged,
  onReload,
}: ProcessesSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const empty = processes.length === 0;

  const used = limit?.used ?? processes.length;
  const max = limit?.max ?? plan?.maxProcesses ?? null;
  const atLimit = max !== null && used >= max;
  const planLabel = plan?.label ?? 'current';
  const canUpgrade = (limit?.planId ?? plan?.id) !== 'enterprise';
  const lockedCount = processes.filter((process) => process.locked).length;
  const slotBusy = Boolean(status?.syncing) || Object.keys(runs).length > 0;

  // The empty state's little Raw → AI → destination illustration bobs along.
  useGSAP(
    () => {
      if (!ref.current || !empty) return;
      const root = ref.current;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(gsap.utils.toArray('.empty-tile', root), {
          y: -8,
          duration: 1.2,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          stagger: { each: 0.25, from: 'start' },
        });
        const spark = root.querySelector('.empty-spark');
        if (spark) gsap.to(spark, { rotation: 18, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1, repeatDelay: 1 });
      });
      return () => mm.revert();
    },
    { dependencies: [empty], scope: ref, revertOnUpdate: true },
  );

  return (
    <section ref={ref} aria-labelledby="processes-heading">
      <div className="dash-item mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="processes-heading" className="text-3xl font-bold">
              Work processes
            </h2>
            {max !== null && (
              <span className={`rounded-full px-3 py-0.5 text-sm font-extrabold ${atLimit ? 'bg-butter' : 'bg-lavender-soft'}`}>
                {/* aria-label isn't reliably read on a plain span; spell it out for screen readers instead. */}
                <span aria-hidden>
                  {formatCount(used)} of {formatCount(max)}
                </span>
                <span className="sr-only">
                  {formatCount(used)} of {plural(max, 'work process', 'work processes')} used
                </span>
              </span>
            )}
          </div>
          <p className="mt-1 text-ink-soft">
            Each process watches one Raw folder and files its images into the destinations you describe.
          </p>
        </div>

        {!empty &&
          (atLimit ? (
            <div className="flex flex-col gap-2 sm:max-w-xs sm:items-end">
              <p className="text-sm text-ink-soft sm:text-right">
                Your {planLabel} plan includes {plural(max ?? 0, 'work process', 'work processes')}.{' '}
                {canUpgrade ? 'Upgrade to add more.' : 'That’s the most any plan includes.'}
              </p>
              {canUpgrade && (
                <ButtonLink to="/plans" size="sm" magnetic className="self-start sm:self-auto">
                  <Sparkles className="h-4 w-4" aria-hidden /> Upgrade for more
                </ButtonLink>
              )}
            </div>
          ) : (
            <ButtonLink to="/processes/new" magnetic className="shrink-0 self-start sm:self-auto">
              <Plus className="h-4 w-4" aria-hidden /> New process
            </ButtonLink>
          ))}
      </div>

      {lockedCount > 0 && (
        <p className="dash-item mb-5 flex items-start gap-2 rounded-2xl border border-butter bg-butter-soft px-4 py-3 text-sm font-semibold">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
          <span>
            {lockedCount === 1 ? '1 process is' : `${formatCount(lockedCount)} processes are`} over your {planLabel} plan’s
            limit, so {lockedCount === 1 ? 'it doesn’t' : 'they don’t'} run. Your oldest processes keep running; upgrade or
            delete one to free a spot.
          </span>
        </p>
      )}

      {empty ? (
        <div className="dash-item rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-12">
          <div className="mx-auto mb-7 flex h-24 items-end justify-center gap-3" aria-hidden>
            <span className="empty-tile flex h-14 w-14 items-center justify-center rounded-2xl bg-butter shadow-soft">
              <FolderInput className="h-6 w-6 text-ink" />
            </span>
            <span className="empty-tile mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-lavender to-periwinkle shadow-soft">
              <Sparkles className="empty-spark h-7 w-7 text-ink" />
            </span>
            <span className="empty-tile flex h-14 w-14 items-center justify-center rounded-2xl bg-sage shadow-soft">
              <FolderCheck className="h-6 w-6 text-ink" />
            </span>
          </div>
          <h3 className="mb-2 text-2xl font-bold">Create your first process</h3>
          <p className="mx-auto mb-7 max-w-md leading-relaxed text-ink-soft">
            Pick a Raw folder to watch, describe where things should go, and DriveTag’s AI tags, renames and files every
            new image for you.
          </p>
          <ButtonLink to="/processes/new" size="lg" magnetic>
            <Plus className="h-5 w-5" aria-hidden /> Create your first process
          </ButtonLink>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {processes.map((process) => {
            const organizing = isOrganizing(process.id, status, runs);
            const entry = status?.statuses[process.id];
            return (
              <ProcessCard
                key={process.id}
                process={process}
                entry={entry}
                statusFailed={statusFailed}
                plan={plan}
                usage={usage}
                sortingActive={sortingActive}
                organizing={organizing}
                busyElsewhere={!organizing && slotBusy}
                progress={organizing ? organizeProgress(runs[process.id], entry) : null}
                workers={status?.workers?.[process.id] ?? 0}
                onOrganizeStarted={onOrganizeStarted}
                onProcessChanged={onProcessChanged}
                onReload={onReload}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
