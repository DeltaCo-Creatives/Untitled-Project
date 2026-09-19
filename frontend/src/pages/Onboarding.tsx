import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  FolderCheck,
  FolderInput,
  FolderTree,
  Gift,
  HardDrive,
  Inbox,
  Info,
  LoaderCircle,
  PartyPopper,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { api, ApiError, type CurrentPlan, type DestinationInput, type MeResponse, type Usage } from '../lib/api';
import { gsap, useGSAP, Flip, MOTION_OK, prefersReducedMotion } from '../lib/gsap';
import { burstConfetti } from '../lib/confetti';
import { browserTimeZone, formatCount } from '../lib/format';
import { errorMessage, friendlyWatchError, usageSummary } from '../lib/messages';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { TextField } from '../components/ui/TextField';
import { FolderBrowser } from '../components/drive/FolderBrowser';
import { FolderPickerField } from '../components/drive/FolderPickerField';
import type { DisabledFolders, PickedFolder } from '../components/drive/types';

type Step = 'loading' | 'connect' | 'raw' | 'sorting' | 'live';

const STEP_INDEX: Record<Step, number> = { loading: 0, connect: 0, raw: 1, sorting: 2, live: 3 };

const STEPS = [
  { label: 'Connect Drive', icon: HardDrive },
  { label: 'Raw folder', icon: FolderInput },
  { label: 'Sorting', icon: FolderTree },
  { label: 'Go live', icon: Sparkles },
];

/** Mirrors PROCESS_LIMITS in backend/src/config/plans.js; the server re-checks both. */
const NAME_MAX = 60;
const DESCRIPTION_MAX = 300;
/** Onboarding keeps the first process simple; the full editor allows many more. */
const MAX_ROWS = 3;
const RENAME_TEMPLATE = '{destination}_{subject}';
const UNSORTED = 'Unsorted';
const FIRST_PROCESS_NAME = 'My first process';

interface Example {
  name: string;
  description: string;
}

const EXAMPLES: Example[] = [
  { name: 'Logos', description: 'brand marks, wordmarks, app icons' },
  { name: 'Graphics', description: 'banners, social posts' },
  { name: 'Photos', description: 'product and team photos' },
];

const ROW_TINTS = ['bg-lavender', 'bg-periwinkle', 'bg-butter'];

interface DestinationRow {
  localId: string;
  name: string;
  description: string;
  /** Placeholder text, so every row suggests something different. */
  example: Example;
}

type RowField = 'name' | 'description';

/** Keys: "master", "destinations", "<localId>.name", "<localId>.description". */
type FieldErrors = Record<string, string>;

let rowCounter = 0;

function makeRow(example: Example, prefill: boolean): DestinationRow {
  rowCounter += 1;
  return {
    localId: `row-${rowCounter}`,
    name: prefill ? example.name : '',
    description: prefill ? example.description : '',
    example,
  };
}

function initialRows() {
  return [makeRow(EXAMPLES[0], true), makeRow(EXAMPLES[2], true)];
}

/** The first example no row is already using, by name or by placeholder. */
function nextExample(rows: DestinationRow[]) {
  const taken = new Set(rows.flatMap((row) => [row.example.name.toLowerCase(), row.name.trim().toLowerCase()]));
  return EXAMPLES.find((example) => !taken.has(example.name.toLowerCase())) ?? EXAMPLES[rows.length % EXAMPLES.length];
}

/**
 * Where each destination row and the blocks below them sit on screen, so a row
 * change can slide them from there. `leaving` skips the row being removed.
 */
function measureRowFlow(root: ParentNode | null, leaving?: string) {
  const tops = new Map<Element, number>();
  root?.querySelectorAll('[data-row], [data-flip-follow]').forEach((element) => {
    if (leaving && element.getAttribute('data-row') === leaving) return;
    tops.set(element, element.getBoundingClientRect().top);
  });
  return tops;
}

function rowKey(localId: string, field: RowField) {
  return `${localId}.${field}`;
}

function omit(errors: FieldErrors, keys: string[]) {
  if (!keys.some((key) => key in errors)) return errors;
  const next = { ...errors };
  for (const key of keys) delete next[key];
  return next;
}

function validateSorting(raw: PickedFolder | null, master: PickedFolder | null, rows: DestinationRow[]): FieldErrors {
  const errors: FieldErrors = {};
  if (!master) errors.master = 'Choose the Master folder your sorted images go into.';
  else if (raw && master.id === raw.id) errors.master = 'The Master folder has to be different from your Raw folder.';

  if (rows.length === 0) errors.destinations = 'Add at least one destination.';

  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim();
    const lower = name.toLowerCase();
    const key = rowKey(row.localId, 'name');
    if (!name) errors[key] = 'Give this destination a name.';
    else if (name.length > NAME_MAX) errors[key] = `Keep names to ${NAME_MAX} characters or fewer.`;
    else if (lower === UNSORTED.toLowerCase()) errors[key] = '“Unsorted” is already there for images that fit nowhere else.';
    else if (seen.has(lower)) errors[key] = `Two destinations are called “${name}”.`;
    if (name) seen.add(lower);

    if (row.description.trim().length > DESCRIPTION_MAX) {
      errors[rowKey(row.localId, 'description')] = `Keep descriptions to ${DESCRIPTION_MAX} characters or fewer.`;
    }
  }
  return errors;
}

/**
 * Maps the server's field paths back onto this page. Destinations were sent as
 * [...rows, Unsorted], so index i < rows.length is rows[i]; a "create" folder is
 * named after its destination, so folder problems belong on the name field.
 */
function fieldErrorsFromApi(err: unknown, rows: DestinationRow[]) {
  const errors: FieldErrors = {};
  let raw: string | null = null;
  if (!(err instanceof ApiError) || !err.details) return { errors, raw };

  for (const { field, message } of err.details) {
    let key: string | null = null;
    if (field === 'rawFolderId') {
      raw ??= message;
      continue;
    }
    if (field === 'masterFolderId') {
      key = 'master';
    } else if (field.startsWith('destinations')) {
      const match = /^destinations\[(\d+)\]\.(name|description|folder)$/.exec(field);
      const row = match ? rows[Number(match[1])] : undefined;
      key = row && match ? rowKey(row.localId, match[2] === 'description' ? 'description' : 'name') : 'destinations';
    }
    if (key && !errors[key]) errors[key] = message;
  }
  return { errors, raw };
}

/** Onboarding only sets up the first process: anyone who already has one belongs on the dashboard. */
async function loadAccountState(): Promise<{ me: MeResponse; next: 'connect' | 'raw' | 'dashboard' }> {
  const me = await api.me();
  if (!me.driveConnected) return { me, next: 'connect' };
  const { processes } = await api.processes.list();
  return { me, next: processes.length > 0 ? 'dashboard' : 'raw' };
}

function processNameFor(raw: PickedFolder) {
  const folderName = raw.name.trim();
  const name = `${folderName} sorting`;
  return folderName && name.length <= NAME_MAX ? name : FIRST_PROCESS_NAME;
}

function planNoteFor(plan: CurrentPlan | null, usage: Usage | null) {
  if (!plan || !usage) {
    const freeImages = plan?.freeImages ?? usage?.freeLimit;
    return {
      text: freeImages
        ? `Free plan: your first ${formatCount(freeImages)} images are on us.`
        : 'You start on the Free plan, no credit card needed.',
      exhausted: false,
    };
  }
  if (usage.exhausted) return { text: usageSummary(plan, usage), exhausted: true };
  if (plan.id === 'free' && usage.freeUsed === 0) {
    return { text: `Free plan: your first ${formatCount(plan.freeImages)} images are on us.`, exhausted: false };
  }
  return { text: `${plan.label} plan: ${usageSummary(plan, usage)}`, exhausted: false };
}

export default function Onboarding() {
  useDocumentTitle('Set up your first process');
  const navigate = useNavigate();
  const fieldPrefix = useId();
  const destinationsHeadingId = useId();

  const pageRef = useRef<HTMLDivElement>(null);
  const stepperRef = useRef<HTMLOListElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pillState = useRef<Flip.FlipState | null>(null);
  const rowTops = useRef<Map<Element, number> | null>(null);
  const enteringRow = useRef<string | null>(null);
  const focusAfterRows = useRef<{ row: string } | 'add' | null>(null);
  const direction = useRef(1);

  const [step, setStep] = useState<Step>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CurrentPlan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  const [raw, setRaw] = useState<PickedFolder | null>(null);
  const [master, setMaster] = useState<PickedFolder | null>(null);
  const [rows, setRows] = useState<DestinationRow[]>(initialRows);
  /** Rows fading out but not yet removed; they still count toward `rows`. */
  const [leaving, setLeaving] = useState<string[]>([]);

  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [shakeKey, setShakeKey] = useState(0);
  const [saving, setSaving] = useState<'create' | 'watch' | null>(null);

  const stepIndex = STEP_INDEX[step];
  const view = loadError ? 'error' : step;
  const rowsKey = rows.map((row) => row.localId).join('|');

  const sortingErrors = validateSorting(raw, master, rows);
  const errorFor = (key: string) => (showErrors ? sortingErrors[key] : undefined) ?? serverErrors[key] ?? null;
  const fieldId = (localId: string, field: RowField) => `${fieldPrefix}-${localId}-${field}`;

  const rawDisabled = useMemo<DisabledFolders | undefined>(
    () => (raw ? { [raw.id]: 'Already your Raw folder' } : undefined),
    [raw],
  );
  const masterDisabled = useMemo<DisabledFolders | undefined>(
    () => (master ? { [master.id]: 'Already your Master folder' } : undefined),
    [master],
  );

  const goTo = useCallback((next: Step, from: Step, { keepError = false } = {}) => {
    const pill = stepperRef.current?.querySelector('[data-flip-id="active-step"]');
    if (pill && STEP_INDEX[next] !== STEP_INDEX[from] && !prefersReducedMotion()) {
      pillState.current = Flip.getState(pill);
    }
    direction.current = STEP_INDEX[next] >= STEP_INDEX[from] ? 1 : -1;
    if (!keepError) setError(null);
    setStep(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAccountState().then(
      ({ me, next }) => {
        if (cancelled) return;
        if (next === 'dashboard') {
          navigate('/dashboard', { replace: true });
          return;
        }
        setPlan(me.plan);
        setUsage(me.usage);
        goTo(next, 'loading');
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err, 'We couldn’t load your account.'));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, goTo, navigate]);

  const retryLoad = () => {
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  };

  const clearServerErrors = (...keys: string[]) => setServerErrors((current) => omit(current, keys));

  const handleConnectDrive = async () => {
    setError(null);
    try {
      const { authUrl } = await api.startGoogleAuth();
      window.location.href = authUrl;
    } catch (err) {
      setError(errorMessage(err, 'We couldn’t start the Google Drive connection.'));
    }
  };

  const pickRaw = (folder: PickedFolder) => {
    setRaw(folder);
    goTo('sorting', step);
  };

  const pickMaster = (folder: PickedFolder) => {
    setMaster(folder);
    clearServerErrors('master');
  };

  const updateRow = (localId: string, field: RowField, value: string) => {
    setRows((current) => current.map((row) => (row.localId === localId ? { ...row, [field]: value } : row)));
    clearServerErrors(rowKey(localId, field), 'destinations');
  };

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return;
    const row = makeRow(nextExample(rows), false);
    if (!prefersReducedMotion()) {
      rowTops.current = measureRowFlow(pageRef.current);
      enteringRow.current = row.localId;
    }
    focusAfterRows.current = { row: row.localId };
    setRows([...rows, row]);
  };

  const { contextSafe } = useGSAP({ scope: pageRef });

  const removeRow = (localId: string, trigger: HTMLElement) => {
    // A second click while the row is already leaving would remove it twice, and removing
    // two rows at once while both are still fading out would leave no destinations at all.
    if (leaving.includes(localId) || rows.length - leaving.length <= 1) return;
    const row = trigger.closest<HTMLElement>('[data-row]');

    const commit = () => {
      if (!prefersReducedMotion()) rowTops.current = measureRowFlow(pageRef.current, localId);
      focusAfterRows.current = 'add';
      setRows((current) => current.filter((candidate) => candidate.localId !== localId));
      setLeaving((current) => current.filter((id) => id !== localId));
      clearServerErrors(rowKey(localId, 'name'), rowKey(localId, 'description'), 'destinations');
    };

    if (!row || prefersReducedMotion()) {
      commit();
      return;
    }
    setLeaving((current) => [...current, localId]);
    contextSafe(() => {
      gsap.to(row, {
        autoAlpha: 0,
        x: 40,
        scale: 0.96,
        duration: 0.28,
        ease: 'power2.in',
        overwrite: 'auto',
        onComplete: commit,
      });
    })();
  };

  const handleContinue = () => {
    if (Object.keys(sortingErrors).length > 0) {
      setShowErrors(true);
      setShakeKey((key) => key + 1);
      return;
    }
    goTo('live', step);
  };

  const handleCreateError = async (err: unknown, submitted: DestinationRow[]) => {
    if (err instanceof ApiError && err.code === 'process_limit_reached') {
      // A first process already exists (another tab, or a retried request): onboarding is done.
      try {
        const { processes } = await api.processes.list();
        if (processes.length > 0) {
          navigate('/dashboard', { replace: true, state: { notice: 'You already have a work process, so here it is.' } });
          return;
        }
      } catch {
        // Fall through and explain the original error instead.
      }
    }

    setSaving(null);
    const message = errorMessage(err, 'We couldn’t create your work process.');
    const { errors, raw: rawProblem } = fieldErrorsFromApi(err, submitted);
    setServerErrors(errors);

    if (rawProblem) {
      setError(`Pick a different Raw folder: ${rawProblem}`);
      goTo('raw', 'live', { keepError: true });
    } else if (Object.keys(errors).length > 0) {
      setError('One of your sorting settings needs a quick fix.');
      goTo('sorting', 'live', { keepError: true });
    } else {
      setError(message);
    }
  };

  const handleStart = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!raw || !master || saving) return;
    const origin = event.currentTarget;
    const submitted = rows;
    setError(null);
    setSaving('create');

    const destinations: DestinationInput[] = [
      ...submitted.map(
        (row): DestinationInput => ({
          name: row.name.trim(),
          description: row.description.trim(),
          isFallback: false,
          folder: { mode: 'create' },
        }),
      ),
      { name: UNSORTED, description: '', isFallback: true, folder: { mode: 'create' } },
    ];

    try {
      await api.processes.create({
        name: processNameFor(raw),
        rawFolderId: raw.id,
        masterFolderId: master.id,
        renameTemplate: RENAME_TEMPLATE,
        instructions: '',
        timezone: browserTimeZone(),
        tagFields: [],
        destinations,
      });
    } catch (err) {
      await handleCreateError(err, submitted);
      return;
    }

    // The process is saved either way; a refused watch shouldn't strand the user here.
    setSaving('watch');
    let notice: string | null = null;
    try {
      await api.startWatch();
    } catch (err) {
      notice = friendlyWatchError(errorMessage(err, 'Automatic sorting couldn’t start.'));
    }

    if (!notice) await burstConfetti(origin);
    navigate('/dashboard', { state: notice ? { notice } : { notice: 'Your first work process is live.' } });
  };

  // ---------------------------------------------------------------- motion

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.onboarding-card', { y: 40, autoAlpha: 0, scale: 0.97, duration: 0.8, ease: 'back.out(1.5)' });
      });
      return () => mm.revert();
    },
    { scope: pageRef },
  );

  useGSAP(
    () => {
      if (!pageRef.current) return;
      if (view !== 'loading') {
        // Steps are long on phones: a button low on one step would otherwise leave you halfway down the next.
        const cardTop = pageRef.current.querySelector('.onboarding-card')?.getBoundingClientRect().top ?? 0;
        if (cardTop < 0) window.scrollBy({ top: cardTop - 16 });
        // Move focus with the step so keyboard and screen reader users land on the new content.
        stepRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      }

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const pill = pageRef.current!.querySelector('[data-flip-id="active-step"]');
        if (pillState.current && pill) {
          Flip.from(pillState.current, { targets: pill, duration: 0.6, ease: 'power3.inOut' });
        }
        pillState.current = null;

        // Opacity, not autoAlpha: the heading was just focused and must stay focusable.
        gsap.fromTo(
          stepRef.current,
          { opacity: 0, x: 48 * direction.current },
          { opacity: 1, x: 0, duration: 0.55, ease: 'power3.out' },
        );
        const icon = stepRef.current?.querySelector('.step-hero-icon');
        if (icon) gsap.from(icon, { scale: 0, rotation: -40, duration: 0.8, ease: 'back.out(2.5)', delay: 0.1 });

        const destinationRows = stepRef.current?.querySelectorAll('.dest-row');
        if (destinationRows?.length) {
          gsap.from(destinationRows, { y: 18, autoAlpha: 0, duration: 0.45, stagger: 0.08, delay: 0.15, ease: 'power2.out' });
        }
        const chips = stepRef.current?.querySelectorAll('.summary-chip');
        if (chips?.length) {
          gsap.from(chips, { scale: 0.6, autoAlpha: 0, duration: 0.5, stagger: 0.06, delay: 0.3, ease: 'back.out(2)' });
        }
      });
      return () => mm.revert();
    },
    { dependencies: [view], scope: pageRef, revertOnUpdate: true },
  );

  // Rows sliding in and out: the new row pops in, everything below glides to its new place.
  // Position-only FLIP (y transforms), so blocks that change height never squish.
  useGSAP(
    () => {
      const entering = enteringRow.current;
      const tops = rowTops.current;
      const focus = focusAfterRows.current;
      enteringRow.current = null;
      rowTops.current = null;
      focusAfterRows.current = null;

      if (focus === 'add') addButtonRef.current?.focus();
      else if (focus) document.getElementById(fieldId(focus.row, 'name'))?.focus();

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        tops?.forEach((top, element) => {
          if (!element.isConnected) return;
          const delta = top - element.getBoundingClientRect().top;
          if (Math.abs(delta) > 0.5) gsap.from(element, { y: delta, duration: 0.45, ease: 'power3.inOut' });
        });
        if (entering) {
          // Opacity, not autoAlpha: the new row's name field was just focused, and visibility:hidden would drop that focus.
          gsap.from(`[data-row="${entering}"]`, { opacity: 0, y: -14, scale: 0.97, duration: 0.5, ease: 'back.out(1.6)' });
        }
      });
      return () => mm.revert();
    },
    { dependencies: [rowsKey], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      if (shakeKey === 0) return;
      const invalid = gsap.utils.toArray<HTMLElement>('[data-invalid="true"]', stepRef.current);
      invalid[0]?.querySelector<HTMLElement>('input, textarea, button')?.focus();
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(invalid, { keyframes: { x: [0, -8, 7, -4, 0] }, duration: 0.45 });
      });
      return () => mm.revert();
    },
    { dependencies: [shakeKey], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        if (raw) gsap.from('[data-chip="raw"]', { scale: 0.5, autoAlpha: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
      });
      return () => mm.revert();
    },
    { dependencies: [raw?.id], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        if (master) gsap.from('[data-chip="master"]', { scale: 0.5, autoAlpha: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
      });
      return () => mm.revert();
    },
    { dependencies: [master?.id], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      if (!error) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.onboarding-error', { y: -10, autoAlpha: 0, duration: 0.35 });
        gsap.to('.onboarding-error', { keyframes: { x: [0, -8, 7, -4, 0] }, duration: 0.45 });
      });
      return () => mm.revert();
    },
    { dependencies: [error], scope: pageRef, revertOnUpdate: true },
  );

  // ---------------------------------------------------------------- render

  const planNote = planNoteFor(plan, usage);
  const destinationsError = errorFor('destinations');

  return (
    <div ref={pageRef} className="min-h-screen">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <Link
          to="/dashboard"
          className="rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
        >
          Dashboard
        </Link>
      </div>

      <main id="main-content" className="px-4 pb-16 pt-4 sm:pt-10">
        <div className="onboarding-card mx-auto w-full max-w-2xl rounded-[2rem] border border-line bg-white p-5 shadow-lift sm:p-10">
          <ol ref={stepperRef} aria-label="Setup steps" className="mb-6 grid grid-cols-4 gap-1 rounded-2xl bg-lavender-soft p-1.5">
            {STEPS.map((item, i) => {
              const active = i === stepIndex;
              const done = i < stepIndex;
              return (
                <li key={item.label} className="relative" aria-current={active ? 'step' : undefined}>
                  {active && <span data-flip-id="active-step" className="absolute inset-0 rounded-xl bg-white shadow-soft" />}
                  <span
                    className={`relative flex items-center justify-center gap-2 px-1 py-2 text-sm font-bold ${active || done ? 'text-ink' : 'text-ink-soft'}`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ${done ? 'bg-sage' : active ? 'bg-lavender' : 'bg-white/80'}`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <item.icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="hidden md:inline">{item.label}</span>
                    <span className="sr-only md:hidden">{item.label}</span>
                    {done && <span className="sr-only"> (done)</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          {(raw || master) && (
            <div className="mb-6 flex flex-wrap gap-2">
              {raw && (
                <span
                  data-chip="raw"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-butter-soft px-3 py-1 text-xs font-bold"
                >
                  <FolderInput className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">Raw: {raw.name}</span>
                </span>
              )}
              {master && (
                <span
                  data-chip="master"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-xs font-bold"
                >
                  <FolderCheck className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">Master: {master.name}</span>
                </span>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="onboarding-error mb-6 flex items-start gap-2 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          <div ref={stepRef}>
            {loadError ? (
              <div className="py-6 text-center">
                <div className="step-hero-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose">
                  <CircleAlert className="h-8 w-8 text-rose-ink" />
                </div>
                <h2 tabIndex={-1} className="mb-2 text-2xl font-bold outline-none">
                  We couldn’t load your account
                </h2>
                <p role="alert" className="mx-auto mb-7 max-w-md text-ink-soft">
                  {loadError}
                </p>
                <Button onClick={retryLoad} size="lg">
                  <RefreshCw className="h-4 w-4" /> Try again
                </Button>
              </div>
            ) : step === 'loading' ? (
              <div className="space-y-3 py-4" role="status" aria-label="Loading your account">
                <Skeleton className="mx-auto h-16 w-16" />
                <Skeleton className="mx-auto h-7 w-2/3" />
                <Skeleton className="mx-auto h-4 w-1/2" />
              </div>
            ) : step === 'connect' ? (
              <div className="py-2 text-center">
                <div className="step-hero-icon mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-lavender to-periwinkle shadow-soft">
                  <HardDrive className="h-9 w-9 text-ink" />
                </div>
                <h2 tabIndex={-1} className="mb-3 text-3xl font-bold tracking-tight outline-none">
                  Connect Google Drive
                </h2>
                <p className="mx-auto mb-4 max-w-md leading-relaxed text-ink-soft">
                  DriveTag needs its own Drive permission, separate from your login, so it can keep sorting while you’re
                  away. You can disconnect anytime.
                </p>
                <p className="mx-auto mb-8 max-w-md text-left text-sm leading-relaxed text-ink-soft">
                  With this permission, DriveTag will:
                </p>
                <ul className="mx-auto mb-8 max-w-md space-y-1.5 text-left text-sm leading-relaxed text-ink-soft">
                  <li className="flex gap-2">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sage-deep" /> Read images others add to
                    your Raw folders
                  </li>
                  <li className="flex gap-2">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sage-deep" /> Rename and move them into
                    the folders you choose
                  </li>
                  <li className="flex gap-2">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sage-deep" /> Never delete anything
                  </li>
                </ul>
                <p className="mx-auto mb-8 max-w-md text-xs leading-relaxed text-ink-soft">
                  Details in the{' '}
                  <Link to="/privacy#google-user-data" className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
                    Privacy Policy
                  </Link>
                  .
                </p>
                <Button onClick={handleConnectDrive} size="lg" magnetic>
                  Connect Google Drive <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : step === 'raw' ? (
              <div>
                <div className="mb-6 text-center">
                  <div className="step-hero-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-butter">
                    <FolderInput className="h-8 w-8 text-ink" />
                  </div>
                  <h2 tabIndex={-1} className="mb-3 text-3xl font-bold tracking-tight outline-none">
                    Pick your Raw folder
                  </h2>
                  <p className="mx-auto max-w-md leading-relaxed text-ink-soft">
                    The folder where you and your team drop unsorted images. DriveTag watches it and sorts anything new
                    that lands there.
                  </p>
                </div>

                <FolderBrowser selectedId={raw?.id ?? null} onSelect={pickRaw} disabledFolders={masterDisabled} />

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-lavender-deep" />
                    <span>
                      No drop zone yet? Make one with <strong className="text-ink">New folder</strong>.
                    </span>
                  </p>
                  {raw && (
                    <Button onClick={() => goTo('sorting', step)} className="shrink-0">
                      Continue <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ) : step === 'sorting' ? (
              <div>
                <div className="mb-7 text-center">
                  <div className="step-hero-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-sage">
                    <FolderTree className="h-8 w-8 text-ink" />
                  </div>
                  <h2 tabIndex={-1} className="mb-3 text-3xl font-bold tracking-tight outline-none">
                    Tell DriveTag where things go
                  </h2>
                  <p className="mx-auto max-w-md leading-relaxed text-ink-soft">
                    The AI looks at each new image and picks the destination whose name and description fit it best.
                  </p>
                </div>

                <div data-invalid={errorFor('master') ? 'true' : undefined} className="mb-8">
                  <FolderPickerField
                    label="Master folder"
                    value={master}
                    onChange={pickMaster}
                    hint="Sorted images go into folders inside this one."
                    error={errorFor('master')}
                    disabledFolders={rawDisabled}
                    tone="sage"
                    placeholder="Choose the Master folder"
                  />
                </div>

                <section aria-labelledby={destinationsHeadingId}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <h3 id={destinationsHeadingId} className="text-lg font-bold">
                      Destinations
                    </h3>
                    <span className="text-xs font-bold tabular-nums text-ink-soft">
                      {rows.length} of {MAX_ROWS}
                      <span className="sr-only"> destinations</span>
                    </span>
                  </div>
                  <p className="mb-4 text-sm leading-relaxed text-ink-soft">
                    Name each folder and say, in plain words, what belongs in it.
                  </p>

                  <div className="space-y-3">
                    {rows.map((row, index) => {
                      const title = row.name.trim() || `Destination ${index + 1}`;
                      const nameError = errorFor(rowKey(row.localId, 'name'));
                      const descriptionError = errorFor(rowKey(row.localId, 'description'));
                      return (
                        <div
                          key={row.localId}
                          data-row={row.localId}
                          role="group"
                          aria-labelledby={`${fieldPrefix}-${row.localId}-title`}
                          className="dest-row rounded-2xl border border-line bg-white p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p
                              id={`${fieldPrefix}-${row.localId}-title`}
                              className="flex min-w-0 items-center gap-2 text-sm font-bold"
                            >
                              <span
                                aria-hidden
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${ROW_TINTS[index % ROW_TINTS.length]}`}
                              >
                                {index + 1}
                              </span>
                              <span className="min-w-0 truncate">{title}</span>
                            </p>
                            {(rows.length - leaving.length > 1 || leaving.includes(row.localId)) && (
                              <button
                                type="button"
                                onClick={(event) => removeRow(row.localId, event.currentTarget)}
                                aria-label={`Remove ${title}`}
                                title="Remove"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-rose-soft hover:text-rose-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                            <div data-invalid={nameError ? 'true' : undefined}>
                              <TextField
                                id={fieldId(row.localId, 'name')}
                                label="Folder name"
                                value={row.name}
                                onChange={(event) => updateRow(row.localId, 'name', event.currentTarget.value)}
                                placeholder={row.example.name}
                                error={nameError}
                                autoComplete="off"
                              />
                            </div>
                            <div data-invalid={descriptionError ? 'true' : undefined}>
                              <TextField
                                id={fieldId(row.localId, 'description')}
                                label="What goes in it"
                                value={row.description}
                                onChange={(event) => updateRow(row.localId, 'description', event.currentTarget.value)}
                                placeholder={row.example.description}
                                error={descriptionError}
                                autoComplete="off"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div data-flip-follow className="mt-3 space-y-3">
                    {rows.length < MAX_ROWS && (
                      <Button
                        ref={addButtonRef}
                        variant="secondary"
                        size="sm"
                        onClick={addRow}
                        className="w-full border-dashed sm:w-auto"
                      >
                        <Plus className="h-4 w-4" /> Add another
                      </Button>
                    )}

                    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-canvas">
                        <Inbox className="h-4 w-4 text-ink-soft" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold">{UNSORTED}</p>
                        <p className="text-xs text-ink-soft">Added for you, always there as the fallback.</p>
                      </div>
                    </div>

                    <p className="flex items-start gap-2 rounded-2xl bg-periwinkle-soft px-4 py-3 text-sm leading-relaxed text-ink">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        DriveTag creates these folders inside your Master folder. Images that fit none go to Unsorted.
                      </span>
                    </p>

                    {destinationsError && (
                      <p role="alert" className="text-xs font-semibold text-rose-ink">
                        {destinationsError}
                      </p>
                    )}
                  </div>
                </section>

                <div data-flip-follow className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="ghost" onClick={() => goTo('raw', step)}>
                    <ArrowLeft className="h-4 w-4" /> Raw folder
                  </Button>
                  <Button size="lg" magnetic onClick={handleContinue}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="step-hero-icon mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-butter to-rose shadow-soft">
                  <PartyPopper className="h-9 w-9 text-ink" />
                </div>
                <h2 tabIndex={-1} className="mb-3 text-3xl font-bold tracking-tight outline-none">
                  Ready to go live
                </h2>
                <p className="mx-auto mb-7 max-w-md leading-relaxed text-ink-soft">
                  New images dropped into <strong className="text-ink">{raw?.name}</strong> get sorted automatically:
                  tagged, renamed and moved into the right folder inside{' '}
                  <strong className="text-ink">{master?.name}</strong>. Images already in there wait on your dashboard
                  until you choose <strong className="text-ink">Organize now</strong>.
                </p>

                <div className="mx-auto mb-6 max-w-lg rounded-3xl border border-line bg-canvas p-4 text-left sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1 rounded-2xl bg-butter-soft p-4">
                      <FolderInput className="mb-2 h-5 w-5" />
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Raw</p>
                      <p className="truncate font-bold">{raw?.name}</p>
                    </div>
                    <ArrowDown aria-hidden className="mx-auto h-5 w-5 shrink-0 text-lavender-deep sm:hidden" />
                    <ArrowRight aria-hidden className="hidden h-5 w-5 shrink-0 text-lavender-deep sm:block" />
                    <div className="min-w-0 flex-1 rounded-2xl bg-sage-soft p-4">
                      <FolderCheck className="mb-2 h-5 w-5" />
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Master</p>
                      <p className="truncate font-bold">{master?.name}</p>
                    </div>
                  </div>

                  <p id={`${fieldPrefix}-sorted-into`} className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Sorted into
                  </p>
                  <ul aria-labelledby={`${fieldPrefix}-sorted-into`} className="flex flex-wrap gap-2">
                    {rows.map((row, index) => (
                      <li
                        key={row.localId}
                        className="summary-chip inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm font-bold"
                      >
                        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROW_TINTS[index % ROW_TINTS.length]}`} />
                        <span className="min-w-0 truncate">{row.name.trim()}</span>
                      </li>
                    ))}
                    <li className="summary-chip inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-line bg-white px-3 py-1.5 text-sm font-bold text-ink-soft">
                      <Inbox aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{UNSORTED}</span>
                    </li>
                  </ul>
                </div>

                {planNote.exhausted ? (
                  <p className="mx-auto mb-7 flex max-w-md items-start gap-2 rounded-2xl bg-rose-soft px-4 py-3 text-left text-sm font-semibold text-rose-ink">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {planNote.text} New images wait in Raw until then.{' '}
                      <Link
                        to="/plans"
                        className="rounded underline underline-offset-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
                      >
                        See plans
                      </Link>
                    </span>
                  </p>
                ) : (
                  <p className="mx-auto mb-7 flex max-w-md items-start justify-center gap-2 text-sm font-semibold text-ink-soft">
                    <Gift className="mt-0.5 h-4 w-4 shrink-0 text-lavender-deep" />
                    <span>{planNote.text}</span>
                  </p>
                )}

                <div className="flex flex-col items-center gap-2">
                  <Button
                    onClick={handleStart}
                    disabled={saving !== null}
                    size="lg"
                    magnetic
                    className="w-full max-w-sm"
                  >
                    {saving ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                        {saving === 'create' ? 'Creating your folders…' : 'Switching on sorting…'}
                      </>
                    ) : (
                      <>
                        Start organizing <Sparkles className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <p className="sr-only" aria-live="polite">
                    {saving === 'create'
                      ? 'Creating your work process'
                      : saving === 'watch'
                        ? 'Starting automatic sorting'
                        : ''}
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => goTo('sorting', step)} disabled={saving !== null}>
                    <ArrowLeft className="h-4 w-4" /> Change sorting
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
