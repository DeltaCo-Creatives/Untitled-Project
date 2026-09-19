import { useId, useRef, useState } from 'react';
import { Check, CircleAlert, FileText, FolderCheck, Image as ImageIcon, ImageUp, LoaderCircle } from 'lucide-react';
import type { ActivityEntry, ProcessKind, WorkProcess } from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { displayTag, kindArticleWord, kindWord } from '../../lib/messages';
import { formatCount, timeAgo } from '../../lib/format';

interface ActivityListProps {
  activity: ActivityEntry[];
  processes: WorkProcess[];
  /** Files are being sorted right now; the list refreshes every few seconds. */
  live: boolean;
  className?: string;
}

const ALL = 'all';
/** Past this many processes the filter becomes a dropdown instead of a row of chips. */
const MAX_FILTER_CHIPS = 6;

const STATUS_STYLES: Record<ActivityEntry['status'], { bubble: string; label: string }> = {
  completed: { bubble: 'bg-sage', label: 'Organized' },
  processing: { bubble: 'bg-butter', label: 'Processing' },
  failed: { bubble: 'bg-rose', label: 'Failed' },
};

const TAG_TINTS = ['bg-lavender-soft', 'bg-butter-soft', 'bg-sage-soft', 'bg-periwinkle-soft'];

const chipBase =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60';

const KIND_FILTERS: { id: 'all' | ProcessKind; label: string }[] = [
  { id: 'all', label: 'All kinds' },
  { id: 'image', label: 'Images' },
  { id: 'document', label: 'Documents' },
];

export function ActivityList({ activity, processes, live, className = '' }: ActivityListProps) {
  const ref = useRef<HTMLElement>(null);
  const selectId = useId();
  const seenFileIds = useRef<Set<string> | null>(null);
  const [filter, setFilter] = useState<string>(ALL);
  const [kindFilter, setKindFilter] = useState<'all' | ProcessKind>('all');

  // A process deleted since it was picked falls back to showing everything.
  const activeFilter = filter !== ALL && processes.some((process) => process.id === filter) ? filter : ALL;
  // Only worth showing once the account actually mixes kinds — a single-kind account gains nothing from it.
  const showKindFilter = activity.some((entry) => (entry.kind ?? 'image') === 'image') && activity.some((entry) => entry.kind === 'document');
  const activeKindFilter = showKindFilter ? kindFilter : 'all';
  const rows = activity
    .filter((entry) => activeFilter === ALL || entry.process_id === activeFilter)
    .filter((entry) => activeKindFilter === 'all' || (entry.kind ?? 'image') === activeKindFilter);
  const names = new Map(processes.map((process) => [process.id, process.name]));
  const showFilter = processes.length > 1;
  const perProcess = new Map<string, number>();
  for (const entry of activity) {
    if (entry.process_id) perProcess.set(entry.process_id, (perProcess.get(entry.process_id) ?? 0) + 1);
  }
  const idsKey = activity.map((entry) => entry.file_id).join('|');
  const entrance = useRef<gsap.core.Tween | null>(null);

  // Entrance: rows slide in once, after the page's cards.
  useGSAP(
    () => {
      if (!ref.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const items = gsap.utils.toArray<HTMLElement>('.activity-row', ref.current);
        if (items.length > 0) {
          entrance.current = gsap.from(items, {
            x: -24,
            autoAlpha: 0,
            stagger: 0.05,
            duration: 0.5,
            ease: 'power3.out',
            delay: 0.35,
          });
        }
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  // Rows that arrived through polling slide in with a brief lavender glow. Keyed on ids so status changes don't replay it.
  useGSAP(
    () => {
      if (!ref.current) return;
      const previous = seenFileIds.current;
      seenFileIds.current = new Set(idsKey ? idsKey.split('|') : []);
      if (!previous) return;

      const fresh = gsap.utils
        .toArray<HTMLElement>('.activity-row', ref.current)
        .filter((row) => !previous.has(row.dataset.fileId ?? ''));
      if (fresh.length === 0) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          fresh,
          { x: -28, autoAlpha: 0, backgroundColor: 'rgb(239, 233, 255)' },
          { x: 0, autoAlpha: 1, duration: 0.55, stagger: 0.06, ease: 'back.out(1.6)' },
        );
        // Clear the inline color afterwards so the row's hover tint works again.
        gsap.to(fresh, {
          backgroundColor: 'rgba(239, 233, 255, 0)',
          duration: 1.8,
          delay: 0.8,
          ease: 'power1.out',
          clearProps: 'backgroundColor',
        });
      });
      return () => mm.revert();
    },
    { dependencies: [idsKey], scope: ref, revertOnUpdate: true },
  );

  // Switching the filter gives the new set of rows a quick settle-in (not on first render).
  const filterKey = `${activeFilter}|${activeKindFilter}`;
  const lastFilterKey = useRef(filterKey);
  useGSAP(
    () => {
      if (!ref.current) return;
      if (lastFilterKey.current === filterKey) return;
      lastFilterKey.current = filterKey;
      // Rows still mid-entrance would otherwise fade in twice.
      entrance.current?.progress(1);
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const items = gsap.utils.toArray<HTMLElement>('.activity-row, .activity-empty', ref.current);
        // fromTo with explicit ends: a from() started mid-entrance would capture a hidden row as its end state.
        if (items.length > 0) {
          gsap.fromTo(
            items,
            { y: 10, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, stagger: 0.03, duration: 0.35, ease: 'power2.out' },
          );
        }
      });
      return () => mm.revert();
    },
    { dependencies: [filterKey], scope: ref, revertOnUpdate: true },
  );

  const filterName = activeFilter === ALL ? null : names.get(activeFilter);
  const filterProcess = activeFilter === ALL ? null : processes.find((process) => process.id === activeFilter);
  const onlyProcess = processes.length === 1 ? processes[0] : null;

  return (
    <section
      ref={ref}
      aria-labelledby="activity-heading"
      className={`rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8 ${className}`}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="activity-heading" className="text-2xl font-bold">
          Recent activity
        </h2>
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-butter-soft px-3 py-1 text-xs font-bold">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Updating live
          </span>
        )}
      </div>
      {/* Persistent so the "live" state change is reliably announced, rather than relying on a live region
          that only enters the DOM once polling starts. */}
      <p className="sr-only" aria-live="polite">
        {live ? 'Activity is updating live.' : ''}
      </p>

      {showFilter &&
        (processes.length <= MAX_FILTER_CHIPS ? (
          <div role="group" aria-label="Show activity from" className="mb-4 flex flex-wrap gap-2">
            {[{ id: ALL, name: 'All processes' }, ...processes].map((option) => {
              const selected = option.id === activeFilter;
              const count = option.id === ALL ? activity.length : (perProcess.get(option.id) ?? 0);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFilter(option.id)}
                  className={`${chipBase} max-w-full ${
                    selected ? 'bg-lavender text-ink shadow-soft' : 'bg-lavender-soft text-ink-soft hover:text-ink'
                  }`}
                >
                  <span className="min-w-0 truncate">{option.name}</span>
                  <span
                    className={`rounded-full px-1.5 text-xs font-extrabold tabular-nums ${selected ? 'bg-white/70' : 'bg-white'}`}
                  >
                    {formatCount(count)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="text-sm font-bold text-ink-soft">
              Show activity from
            </label>
            <select
              id={selectId}
              value={activeFilter}
              onChange={(event) => setFilter(event.currentTarget.value)}
              className="max-w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm font-bold shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
            >
              <option value={ALL}>All processes ({formatCount(activity.length)})</option>
              {processes.map((process) => (
                <option key={process.id} value={process.id}>
                  {process.name} ({formatCount(perProcess.get(process.id) ?? 0)})
                </option>
              ))}
            </select>
          </div>
        ))}

      {showKindFilter && (
        <div role="group" aria-label="Show activity of kind" className="mb-4 flex flex-wrap gap-2">
          {KIND_FILTERS.map((option) => {
            const selected = option.id === activeKindFilter;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setKindFilter(option.id)}
                className={`${chipBase} ${selected ? 'bg-periwinkle text-ink shadow-soft' : 'bg-periwinkle-soft text-ink-soft hover:text-ink'}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="activity-empty flex flex-col items-center py-10 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-lavender-soft" aria-hidden>
            <ImageUp className="h-9 w-9 text-lavender-deep" />
          </div>
          {filterName ? (
            <>
              {/* Filtering is client-side over the latest rows, so older files may exist: don't say "yet". */}
              <h3 className="mb-2 text-xl font-semibold">No recent files from “{filterName}”</h3>
              <p className="max-w-sm leading-relaxed text-ink-soft">
                {filterProcess?.kind === 'document' ? 'Documents' : 'Images'} this process sorts show up here — tagged,
                renamed, and filed.
              </p>
            </>
          ) : (
            <>
              <h3 className="mb-2 text-xl font-semibold">No files yet</h3>
              <p className="max-w-sm leading-relaxed text-ink-soft">
                {onlyProcess?.rawFolderName ? (
                  <>
                    Drop {kindArticleWord(onlyProcess.kind)} into <strong className="text-ink">{onlyProcess.rawFolderName}</strong> and
                    it’ll show up here — tagged, renamed, and filed.
                  </>
                ) : processes.length === 0 ? (
                  'Create a work process, drop a file into its Raw folder, and it’ll show up here — tagged, renamed, and filed.'
                ) : (
                  'Drop a file into one of your Raw folders and it’ll show up here — tagged, renamed, and filed.'
                )}
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((entry) => {
            const style = STATUS_STYLES[entry.status];
            const entryKind: ProcessKind = entry.kind ?? 'image';
            const tags =
              entryKind === 'document'
                ? ([
                    entry.tags?.type && displayTag(entry.tags.type),
                    entry.tags?.topic && displayTag(entry.tags.topic),
                    entry.tags?.organization && displayTag(entry.tags.organization),
                    entry.tags?.document_date,
                  ].filter(Boolean) as string[])
                : [entry.tags?.genre, entry.tags?.subject, entry.tags?.style].filter((v): v is string => Boolean(v)).map(displayTag);
            const fields = (entry.tags?.fields ?? []).filter((field) => field.value?.trim());
            const processName = activeFilter === ALL && processes.length > 1 && entry.process_id ? names.get(entry.process_id) : null;
            const hasChips = Boolean(entry.destination_name) || tags.length > 0 || fields.length > 0;
            const KindIcon = entryKind === 'document' ? FileText : ImageIcon;
            return (
              <li
                key={entry.file_id}
                data-file-id={entry.file_id}
                className="activity-row flex flex-col gap-3 rounded-2xl px-2 py-4 hover:bg-canvas sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${style.bubble}`} title={style.label}>
                    {entry.status === 'completed' ? (
                      <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                    ) : entry.status === 'processing' ? (
                      <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                    ) : (
                      <CircleAlert className="h-4 w-4 text-rose-ink" aria-hidden />
                    )}
                    <span className="sr-only">{style.label}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 font-bold" title={entry.new_name ?? entry.original_name ?? undefined}>
                      <KindIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                      <span className="sr-only">{kindWord(entryKind, 1)}: </span>
                      <span className="min-w-0 truncate">{entry.new_name ?? entry.original_name ?? entry.file_id}</span>
                    </p>
                    {entry.status === 'failed' && entry.error_message ? (
                      <p className="line-clamp-2 text-sm font-semibold text-rose-ink">{entry.error_message}</p>
                    ) : (
                      (entry.new_name && entry.original_name) || processName ? (
                        <p className="truncate text-sm text-ink-soft">
                          {entry.new_name && entry.original_name ? `was ${entry.original_name}` : null}
                          {entry.new_name && entry.original_name && processName ? ' · ' : null}
                          {processName ? `in ${processName}` : null}
                        </p>
                      ) : null
                    )}
                  </div>
                </div>

                {hasChips && (
                  <ul className="flex flex-wrap gap-1.5 pl-[3.25rem] sm:max-w-[45%] sm:justify-end sm:pl-0" aria-label="Tags">
                    {entry.destination_name && (
                      <li className="inline-flex max-w-full items-center gap-1 rounded-full bg-periwinkle-soft px-2.5 py-0.5 text-xs font-bold">
                        <FolderCheck className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">
                          <span className="sr-only">Filed in </span>
                          {entry.destination_name}
                        </span>
                      </li>
                    )}
                    {tags.map((tag, i) => (
                      <li key={`${tag}-${i}`} className={`max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-bold ${TAG_TINTS[i % TAG_TINTS.length]}`}>
                        {tag}
                      </li>
                    ))}
                    {fields.map((field, i) => (
                      <li
                        key={`${field.key}-${i}`}
                        className="max-w-full truncate rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs font-bold"
                        title={`${field.label}: ${field.value}`}
                      >
                        <span className="font-semibold text-ink-soft">{field.label}:</span> {field.value}
                      </li>
                    ))}
                  </ul>
                )}

                <span className="shrink-0 pl-[3.25rem] text-sm font-semibold text-ink-soft sm:w-28 sm:pl-0 sm:text-right">
                  {timeAgo(entry.processed_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
