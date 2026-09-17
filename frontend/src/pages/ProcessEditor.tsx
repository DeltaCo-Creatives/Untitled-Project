import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Crown,
  Info,
  LoaderCircle,
  Lock,
  MessageSquareText,
  Pause,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Signpost,
  Sparkles,
  Tags,
  Trash,
  Type,
} from 'lucide-react';
import { ApiError, api, type ProcessesResponse } from '../lib/api';
import { browserTimeZone, plural, timeAgo } from '../lib/format';
import { gsap, useGSAP, Flip, ScrollTrigger, SplitText, MOTION_OK, prefersReducedMotion } from '../lib/gsap';
import { errorMessage, friendlyWatchError } from '../lib/messages';
import { usePlans } from '../hooks/usePlans';
import { Logo } from '../components/ui/Logo';
import { Button, ButtonLink } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
// Explicit extension: on case-insensitive file systems "ProcessForm" would otherwise resolve to processForm.ts.
import { ProcessForm } from '../components/processes/ProcessForm';
import {
  DEFAULT_PROCESS_LIMITS,
  PROCESS_SECTIONS,
  currentServerErrors,
  draftFromProcess,
  draftSnapshot,
  emptyDraft,
  fieldErrorsFromApi,
  sectionOfField,
  toProcessInput,
  validateDraft,
  type FieldErrors,
  type ProcessDraft,
  type ProcessSectionId,
} from '../components/processes/processDraft';

const SECTION_ICONS: Record<ProcessSectionId, ComponentType<{ className?: string }>> = {
  basics: Settings2,
  destinations: Signpost,
  naming: Type,
  tags: Tags,
  instructions: MessageSquareText,
};

type View = 'loading' | 'error' | 'not-found' | 'limit' | 'form';

/**
 * A new process only sorts on its own while the account's Drive watch is on. The first process switches it on, as
 * onboarding does; later ones leave that choice alone and say how to turn it on. Never throws: the process is saved.
 */
async function createdNotice(name: string, rawName: string, firstProcess: boolean) {
  const created = `Created “${name}”.`;
  let watching: boolean | null = null;
  try {
    ({ watching } = await api.getWatch());
  } catch {
    // Unknown: a first process tries to start sorting anyway; otherwise promise nothing either way.
  }
  if (!watching && firstProcess) {
    try {
      await api.startWatch();
      watching = true;
    } catch (err) {
      return `${created} ${friendlyWatchError(errorMessage(err, 'Automatic sorting couldn’t start.'))}`;
    }
  }
  if (watching) return `${created} Drop images into “${rawName}” to see it work.`;
  if (watching === false) return `${created} Switch on automatic sorting to sort new images, or use “Organize now”.`;
  return created;
}

/** /processes/new and /processes/:id. Keyed by id so switching processes starts from a clean slate. */
export default function ProcessEditor() {
  const { id } = useParams<{ id: string }>();
  return <ProcessEditorPage key={id ?? 'new'} processId={id ?? null} />;
}

function ProcessEditorPage({ processId }: { processId: string | null }) {
  const navigate = useNavigate();
  const { plans, loading: plansLoading } = usePlans();

  const pageRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLOListElement>(null);
  const pillState = useRef<Flip.FlipState | null>(null);
  const activeRef = useRef<ProcessSectionId>('basics');

  const [data, setData] = useState<ProcessesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [draft, setDraft] = useState<ProcessDraft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [serverErrors, setServerErrors] = useState<{ errors: FieldErrors; sent: ProcessDraft } | null>(null);
  const [focusToken, setFocusToken] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ProcessSectionId>('basics');

  // Opened from a scrolled dashboard: start at the top.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.processes.list().then(
      (response) => {
        if (cancelled) return;
        const current = processId ? response.processes.find((process) => process.id === processId) : null;
        const initial = current ? draftFromProcess(current) : emptyDraft();
        setData(response);
        setDraft(initial);
        setBaseline(draftSnapshot(initial));
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err, 'Couldn’t load your work processes.'));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [processId, reloadToken]);

  // ---------------------------------------------------------------- derived state

  const limits = plans?.processLimits ?? DEFAULT_PROCESS_LIMITS;
  const process = processId ? (data?.processes.find((candidate) => candidate.id === processId) ?? null) : null;
  const others = useMemo(() => data?.processes.filter((candidate) => candidate.id !== processId) ?? [], [data, processId]);

  const view: View = loadError
    ? 'error'
    : !data || !draft || plansLoading
      ? 'loading'
      : processId && !process
        ? 'not-found'
        : !processId && data.limit.used >= data.limit.max
          ? 'limit'
          : 'form';

  const clientErrors = draft && showValidation ? validateDraft(draft, limits, others) : {};
  const liveServerErrors = draft && serverErrors ? currentServerErrors(serverErrors.errors, serverErrors.sent, draft) : {};
  const errors: FieldErrors = { ...liveServerErrors, ...clientErrors };
  const errorCount = Object.keys(errors).length;
  const sectionsWithErrors = new Set(Object.keys(errors).map(sectionOfField));
  const dirty = draft !== null && draftSnapshot(draft) !== baseline;

  const planId = data?.limit.planId ?? 'free';
  const planLabel = plans?.plans.find((plan) => plan.id === planId)?.label ?? planId.charAt(0).toUpperCase() + planId.slice(1);
  const isLastProcess = data?.processes.length === 1;

  // ---------------------------------------------------------------- leaving

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const requestLeave = (to: string) => {
    if (dirty) setLeaveTarget(to);
    else navigate(to);
  };

  // Router links anywhere on the page (logo, upgrade links) ask before dropping unsaved edits.
  const guardLinks = (event: MouseEvent<HTMLDivElement>) => {
    if (!dirty || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest?.('a[href]');
    if (!anchor || anchor.closest('[data-leave-ok]') || anchor.getAttribute('target') === '_blank') return;
    const href = anchor.getAttribute('href') ?? '';
    if (!href.startsWith('/')) return;
    event.preventDefault();
    setLeaveTarget(href);
  };

  // ---------------------------------------------------------------- saving

  const { contextSafe } = useGSAP({ scope: pageRef });

  const shake = contextSafe((element: Element) => {
    gsap.to(element, { keyframes: { x: [0, -12, 10, -7, 4, 0] }, duration: 0.5, ease: 'power1.inOut', overwrite: true });
  });

  const shakeSaveBar = () => {
    const bar = pageRef.current?.querySelector('.save-bar-inner');
    if (bar && !prefersReducedMotion()) shake(bar);
  };

  // After a failed save, bring the first problem into view and put the cursor there.
  useEffect(() => {
    if (focusToken === 0) return;
    const target = formRef.current?.querySelector<HTMLElement>('[data-invalid="true"]');
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    const control = target.matches('input, textarea, button, [tabindex]')
      ? target
      : (target.querySelector<HTMLElement>(
          'input:not([type="radio"]):not([disabled]), textarea:not([disabled]), button:not([disabled])',
        ) ?? target.querySelector<HTMLElement>('input:checked'));
    control?.focus({ preventScroll: true });
  }, [focusToken]);

  const handleSave = async () => {
    if (!draft || saving) return;
    setShowValidation(true);
    setSaveError(null);

    if (Object.keys(validateDraft(draft, limits, others)).length > 0) {
      shakeSaveBar();
      setFocusToken((token) => token + 1);
      return;
    }

    setSaving(true);
    try {
      const input = toProcessInput(draft, browserTimeZone());
      const { process: saved } = processId
        ? await api.processes.update(processId, input)
        : await api.processes.create(input);
      const notice = processId
        ? `Saved “${saved.name}”.`
        : await createdNotice(saved.name, saved.rawFolderName ?? draft.raw?.name ?? 'Raw', data?.processes.length === 0);
      navigate('/dashboard', { state: { notice } });
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && err.status === 400 && err.details?.length) {
        setServerErrors({ errors: fieldErrorsFromApi(err), sent: draft });
        shakeSaveBar();
        setFocusToken((token) => token + 1);
      } else if (err instanceof ApiError && err.status === 402) {
        setLimitMessage(err.message);
      } else if (err instanceof ApiError && err.status === 404 && err.code === 'process_not_found') {
        setSaveError('This process doesn’t exist anymore. It may have been deleted in another tab.');
        shakeSaveBar();
      } else {
        setSaveError(errorMessage(err, 'Couldn’t save this process.'));
        shakeSaveBar();
      }
    }
  };

  const handleDelete = async () => {
    if (!processId || !process) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await api.processes.remove(processId);
      const paused = result.watchStopped ? ' It was your last work process, so automatic sorting is paused.' : '';
      navigate('/dashboard', { state: { notice: `Deleted “${process.name}”.${paused}` } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        navigate('/dashboard', { state: { notice: `“${process.name}” was already deleted.` } });
        return;
      }
      setDeleting(false);
      setDeleteError(errorMessage(err, 'Couldn’t delete this process.'));
    }
  };

  const retryLoad = () => {
    setLoadError(null);
    setData(null);
    setDraft(null);
    setReloadToken((token) => token + 1);
  };

  // ---------------------------------------------------------------- section nav

  const selectSection = (id: ProcessSectionId) => {
    if (activeRef.current === id) return;
    activeRef.current = id;
    const pill = navRef.current?.querySelector('[data-nav-pill]');
    if (pill && !prefersReducedMotion()) pillState.current = Flip.getState(pill);
    setActiveSection(id);
  };

  const goToSection = (event: MouseEvent<HTMLAnchorElement>, id: ProcessSectionId) => {
    event.preventDefault();
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    selectSection(id);
  };

  useGSAP(
    () => {
      const state = pillState.current;
      pillState.current = null;
      const pill = navRef.current?.querySelector('[data-nav-pill]');
      if (!state || !pill) return;
      Flip.from(state, { targets: pill, duration: 0.45, ease: 'power3.inOut', scale: true });
    },
    { dependencies: [activeSection], scope: navRef },
  );

  // Track which section is in the middle of the screen.
  useGSAP(
    () => {
      if (view !== 'form') return;
      for (const { id } of PROCESS_SECTIONS) {
        const section = document.getElementById(id);
        if (!section) continue;
        ScrollTrigger.create({
          trigger: section,
          start: 'top 45%',
          end: 'bottom 45%',
          onToggle: (self) => {
            if (self.isActive) selectSection(id);
          },
        });
      }
      // Cards come and go as the user edits, which moves every section below them.
      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => ScrollTrigger.refresh());
      });
      if (formRef.current) observer.observe(formRef.current);
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
      };
    },
    { dependencies: [view], scope: pageRef, revertOnUpdate: true },
  );

  // ---------------------------------------------------------------- entrance motion

  useGSAP(
    () => {
      const root = pageRef.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.editor-header > *', { y: -20, autoAlpha: 0, stagger: 0.08, duration: 0.6, ease: 'back.out(1.7)' });
      });
      return () => mm.revert();
    },
    { scope: pageRef },
  );

  useGSAP(
    () => {
      const root = pageRef.current;
      if (!root || view === 'loading') return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const title = root.querySelector('.editor-title');
        if (title) {
          SplitText.create(title, {
            type: 'words',
            onSplit: (self) =>
              gsap.from(self.words, { y: 26, autoAlpha: 0, stagger: 0.07, duration: 0.6, ease: 'back.out(2)' }),
          });
        }
        const blocks = gsap.utils.toArray<HTMLElement>('.editor-intro, .editor-banner, .editor-card, .process-section', root);
        if (blocks.length > 0) {
          gsap.from(blocks, { y: 32, autoAlpha: 0, stagger: 0.08, duration: 0.7, ease: 'back.out(1.4)', clearProps: 'transform' });
        }
        const navItems = gsap.utils.toArray<HTMLElement>('.section-nav-item', root);
        if (navItems.length > 0) {
          gsap.from(navItems, { x: -18, autoAlpha: 0, stagger: 0.05, duration: 0.5, delay: 0.15 });
        }
        const bar = root.querySelector('.save-bar');
        if (bar) gsap.from(bar, { yPercent: 130, duration: 0.7, delay: 0.3, ease: 'back.out(1.4)', clearProps: 'transform' });
        const icon = root.querySelector('.editor-hero-icon');
        if (icon) gsap.from(icon, { scale: 0.4, rotation: -20, autoAlpha: 0, duration: 0.9, ease: 'elastic.out(1, 0.5)' });
      });
      return () => mm.revert();
    },
    { dependencies: [view], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      if (!saveError) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.save-status', { y: 8, autoAlpha: 0, duration: 0.35 });
      });
      return () => mm.revert();
    },
    { dependencies: [saveError], scope: pageRef, revertOnUpdate: true },
  );

  // ---------------------------------------------------------------- render

  const status = saving
    ? {
        icon: <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />,
        text: processId ? 'Saving your changes…' : 'Creating your process…',
        tone: 'text-ink',
      }
    : saveError
      ? { icon: <CircleAlert className="h-4 w-4 shrink-0" />, text: saveError, tone: 'text-rose-ink' }
      : showValidation && errorCount > 0
        ? {
            icon: <CircleAlert className="h-4 w-4 shrink-0" />,
            text: `Fix ${plural(errorCount, 'thing', 'things')} before saving.`,
            tone: 'text-rose-ink',
          }
        : dirty
          ? {
              icon: <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-butter ring-4 ring-butter-soft" />,
              text: 'Unsaved changes',
              tone: 'text-ink',
            }
          : processId
            ? { icon: <CircleCheck className="h-4 w-4 shrink-0 text-sage-deep" />, text: 'All changes saved', tone: 'text-ink-soft' }
            : {
                icon: <Info className="h-4 w-4 shrink-0" />,
                text: 'Pick your folders and destinations, then create it.',
                tone: 'text-ink-soft',
              };

  return (
    <div ref={pageRef} className="min-h-screen" onClickCapture={guardLinks}>
      <header className="sticky top-0 z-40 border-b border-line bg-white/75 backdrop-blur-md">
        <div className="editor-header mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo to="/dashboard" size="sm" />
          <Button variant="ghost" size="sm" onClick={() => requestLeave('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to dashboard</span>
            <span className="sm:hidden">Dashboard</span>
          </Button>
        </div>
      </header>

      <main className={`mx-auto max-w-6xl px-4 pt-8 sm:pt-12 ${view === 'form' ? 'pb-44 sm:pb-36' : 'pb-16'}`}>
        {view === 'loading' ? (
          <div className="space-y-6" role="status" aria-label="Loading work process">
            <Skeleton className="h-12 w-72 max-w-full" />
            <Skeleton className="h-5 w-96 max-w-full" />
            <div className="lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-8">
              <Skeleton className="hidden h-60 lg:block" />
              <div className="space-y-6">
                <Skeleton className="h-72" />
                <Skeleton className="h-96" />
              </div>
            </div>
          </div>
        ) : view === 'error' ? (
          <div className="editor-card mx-auto max-w-lg rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
            <div className="editor-hero-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose">
              <CircleAlert className="h-8 w-8 text-rose-ink" />
            </div>
            <h1 className="editor-title mb-2 text-2xl font-bold">
              {processId ? 'We couldn’t load this process' : 'We couldn’t get the editor ready'}
            </h1>
            <p role="alert" className="mb-7 leading-relaxed text-ink-soft">
              {loadError}
            </p>
            <Button onClick={retryLoad} size="lg">
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          </div>
        ) : view === 'not-found' ? (
          <div className="editor-card mx-auto max-w-lg rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
            <div className="editor-hero-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-lavender-soft">
              <Search className="h-8 w-8 text-lavender-deep" />
            </div>
            <h1 className="editor-title mb-2 text-2xl font-bold">We couldn’t find that process</h1>
            <p className="mb-7 leading-relaxed text-ink-soft">It may have been deleted, or the link is out of date.</p>
            <ButtonLink to="/dashboard" size="lg">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </ButtonLink>
          </div>
        ) : view === 'limit' && data ? (
          <div className="editor-card mx-auto max-w-xl rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
            <div className="editor-hero-icon mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-butter to-rose shadow-soft">
              <Crown className="h-9 w-9 text-ink" />
            </div>
            <h1 className="editor-title mb-3 text-3xl font-bold tracking-tight">Your plan is full</h1>
            <p className="mx-auto mb-8 max-w-md leading-relaxed text-ink-soft">
              The {planLabel} plan includes {plural(data.limit.max, 'work process', 'work processes')}, and you’re using{' '}
              {data.limit.used}. Upgrade to add more, or delete a process you no longer need.
            </p>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <ButtonLink to="/plans" size="lg" magnetic>
                <Sparkles className="h-4 w-4" /> See plans
              </ButtonLink>
              <ButtonLink to="/dashboard" size="lg" variant="secondary">
                Back to dashboard
              </ButtonLink>
            </div>
          </div>
        ) : (
          draft &&
          data && (
            <>
              <div className="editor-intro mb-8">
                <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink-soft">
                  {process ? 'Edit work process' : 'Work process'}
                </p>
                <h1 className="editor-title text-4xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-5xl">
                  {process ? process.name : 'New work process'}
                </h1>
                <p className="mt-2 max-w-2xl text-lg leading-relaxed text-ink-soft">
                  {process
                    ? `Sorts images from “${process.rawFolderName ?? 'Raw'}” into “${process.masterFolderName ?? 'Master'}”.`
                    : 'Tell DriveTag where images arrive, where they should go, and how to name them.'}
                </p>
                {process && (
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                    {process.locked ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-soft px-3 py-1 text-rose-ink">
                        <Lock className="h-3.5 w-3.5" /> Locked
                      </span>
                    ) : process.enabled ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-sage-deep">
                        <span aria-hidden className="h-2 w-2 rounded-full bg-sage-deep" /> Running
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-lavender-soft px-3 py-1 text-ink-soft">
                        <Pause className="h-3.5 w-3.5" /> Paused
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-ink-soft shadow-soft">
                      {plural(process.destinations.filter((destination) => !destination.isFallback).length, 'destination', 'destinations')}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-ink-soft shadow-soft">
                      Updated {timeAgo(process.updatedAt)}
                    </span>
                  </div>
                )}
              </div>

              {process?.locked && (
                <div
                  role="note"
                  className="editor-banner mb-6 flex flex-col gap-4 rounded-3xl border border-butter bg-butter-soft p-4 sm:flex-row sm:items-center sm:p-5"
                >
                  <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-butter">
                    <Lock className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm leading-relaxed">
                    <p className="font-bold text-ink">This process is over your plan’s limit, so it won’t run</p>
                    <p className="text-ink-soft">
                      The {planLabel} plan includes {plural(data.limit.max, 'work process', 'work processes')}, and your
                      oldest ones come first. You can still edit or delete this one. Upgrade, or delete another process, to
                      turn it back on.
                    </p>
                  </div>
                  <ButtonLink to="/plans" size="sm" className="shrink-0 self-start sm:self-center">
                    <Sparkles className="h-4 w-4" /> See plans
                  </ButtonLink>
                </div>
              )}

              <div className="lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-8">
                <nav aria-label="Process settings" className="hidden lg:block">
                  <div className="sticky top-24">
                    <ol ref={navRef} className="space-y-1 rounded-3xl border border-line bg-white/80 p-2 shadow-soft backdrop-blur">
                      {PROCESS_SECTIONS.map((section) => {
                        const Icon = SECTION_ICONS[section.id];
                        const active = activeSection === section.id;
                        const invalid = sectionsWithErrors.has(section.id);
                        return (
                          <li key={section.id} className="section-nav-item relative">
                            {active && (
                              <span
                                data-nav-pill
                                data-flip-id="section-nav-pill"
                                aria-hidden
                                className="absolute inset-0 rounded-2xl bg-lavender-soft"
                              />
                            )}
                            <a
                              href={`#${section.id}`}
                              onClick={(event) => goToSection(event, section.id)}
                              aria-current={active ? 'location' : undefined}
                              className={`relative flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 ${
                                active ? 'text-ink' : 'text-ink-soft hover:text-ink'
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="flex-1">{section.label}</span>
                              {invalid && (
                                <>
                                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-rose-ink" />
                                  <span className="sr-only">(needs attention)</span>
                                </>
                              )}
                            </a>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </nav>

                <div ref={formRef} className="min-w-0 space-y-6">
                  <ProcessForm
                    variant="full"
                    draft={draft}
                    onChange={setDraft}
                    errors={errors}
                    limits={limits}
                    otherProcesses={others}
                    disabled={saving}
                  />

                  {process && (
                    <section
                      aria-labelledby="danger-zone-heading"
                      className="process-section rounded-[2rem] border border-rose bg-white p-6 shadow-soft sm:p-8"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-soft">
                          <Trash className="h-5 w-5 text-rose-ink" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 id="danger-zone-heading" className="text-xl font-bold">
                            Delete this process
                          </h2>
                          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                            DriveTag stops sorting for it. Your folders and images in Google Drive stay exactly where they
                            are.
                          </p>
                        </div>
                        <Button
                          variant="danger"
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmDelete(true);
                          }}
                          disabled={saving}
                          className="shrink-0 self-start sm:self-center"
                        >
                          <Trash className="h-4 w-4" /> Delete process
                        </Button>
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </>
          )
        )}
      </main>

      {view === 'form' && (
        <div className="save-bar fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
          <div className="save-bar-inner mx-auto flex max-w-6xl flex-col gap-3 rounded-3xl border border-line bg-white/90 p-3 shadow-lift backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:p-4">
            <p
              role={saveError ? 'alert' : 'status'}
              className={`save-status flex min-w-0 flex-1 items-center gap-2 px-1 text-sm font-bold ${status.tone}`}
            >
              {status.icon}
              <span className="min-w-0">{status.text}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => requestLeave('/dashboard')} disabled={saving} className="flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none">
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : processId ? 'Save changes' : 'Create process'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={leaveTarget !== null}
        title="Discard changes?"
        confirmLabel="Discard changes"
        tone="primary"
        onConfirm={() => {
          const target = leaveTarget;
          setLeaveTarget(null);
          if (target) navigate(target);
        }}
        onCancel={() => setLeaveTarget(null)}
      >
        {processId
          ? 'Your edits to this process haven’t been saved. Leave anyway?'
          : 'This new process hasn’t been saved yet. Leave anyway and lose what you’ve set up?'}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={process ? `Delete “${process.name}”?` : 'Delete this process?'}
        confirmLabel={deleting ? 'Deleting…' : 'Delete process'}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>
          DriveTag stops sorting images dropped into “{process?.rawFolderName ?? 'its Raw folder'}”. Nothing in Google
          Drive is moved or deleted.
        </p>
        {isLastProcess && <p className="mt-2">It’s your only work process, so automatic sorting will pause too.</p>}
        {deleteError && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-soft px-3 py-2 text-sm font-semibold text-rose-ink">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {deleteError}
          </p>
        )}
      </ConfirmDialog>

      <Modal
        open={limitMessage !== null}
        title="Your plan is full"
        description={limitMessage ?? undefined}
        onClose={() => setLimitMessage(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLimitMessage(null)}>
              Keep editing
            </Button>
            <span data-leave-ok className="contents">
              <ButtonLink to="/plans">
                <Sparkles className="h-4 w-4" /> See plans
              </ButtonLink>
            </span>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          This process hasn’t been saved. Paid plans are on the way; until then, deleting a process you no longer need
          makes room for this one.
        </p>
      </Modal>
    </div>
  );
}
