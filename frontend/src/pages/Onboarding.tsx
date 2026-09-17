import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Folder,
  FolderCheck,
  FolderInput,
  HardDrive,
  Inbox,
  LoaderCircle,
  PartyPopper,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { api, type DriveFolder } from '../lib/api';
import { gsap, useGSAP, Flip, MOTION_OK, prefersReducedMotion } from '../lib/gsap';
import { burstConfetti } from '../lib/confetti';
import { errorMessage, friendlyWatchError } from '../lib/messages';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';

type Step = 'loading' | 'connect' | 'raw' | 'dest' | 'confirm' | 'saving';

const STEP_INDEX: Record<Step, number> = { loading: 0, connect: 0, raw: 1, dest: 2, confirm: 3, saving: 3 };

const STEPS = [
  { label: 'Connect Drive', icon: HardDrive },
  { label: 'Raw folder', icon: FolderInput },
  { label: 'Destination', icon: FolderCheck },
  { label: 'Go live', icon: Sparkles },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const stepperRef = useRef<HTMLOListElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const pillState = useRef<Flip.FlipState | null>(null);
  const direction = useRef(1);

  const [step, setStep] = useState<Step>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rawFolder, setRawFolder] = useState<DriveFolder | null>(null);
  const [destFolder, setDestFolder] = useState<DriveFolder | null>(null);

  const [folders, setFolders] = useState<DriveFolder[] | null>(null);
  const [query, setQuery] = useState('');
  const [foldersLoading, setFoldersLoading] = useState(false);

  const stepIndex = STEP_INDEX[step];
  const view = step === 'saving' ? 'confirm' : step;

  const goTo = useCallback((next: Step, from: Step) => {
    const pill = stepperRef.current?.querySelector('[data-flip-id="active-step"]');
    if (pill && STEP_INDEX[next] !== STEP_INDEX[from] && !prefersReducedMotion()) {
      pillState.current = Flip.getState(pill);
    }
    direction.current = STEP_INDEX[next] >= STEP_INDEX[from] ? 1 : -1;
    setStep(next);
  }, []);

  // Already connected + configured users skip straight to confirm rather than re-picking folders.
  const loadAccount = useCallback(async () => {
    try {
      const { driveConnected, config } = await api.me();
      if (!driveConnected) {
        goTo('connect', 'loading');
      } else if (config) {
        setRawFolder({ id: config.rawFolderId, name: config.rawFolderName });
        setDestFolder({ id: config.destinationFolderId, name: config.destinationFolderName });
        goTo('confirm', 'loading');
      } else {
        goTo('raw', 'loading');
      }
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load your account'));
    }
  }, [goTo]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (step !== 'raw' && step !== 'dest') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setFoldersLoading(true);
      setError(null);
      try {
        const { folders } = await api.listFolders(query || undefined);
        if (!cancelled) setFolders(folders);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Failed to load folders'));
      } finally {
        if (!cancelled) setFoldersLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, query]);

  const retryLoad = () => {
    setLoadError(null);
    void loadAccount();
  };

  const handleConnectDrive = async () => {
    setError(null);
    try {
      const { authUrl } = await api.startGoogleAuth();
      window.location.href = authUrl;
    } catch (err) {
      setError(errorMessage(err, 'Failed to start Google Drive connection'));
    }
  };

  const pickRaw = (folder: DriveFolder) => {
    setRawFolder(folder);
    setQuery('');
    goTo('dest', step);
  };

  const pickDest = (folder: DriveFolder) => {
    setDestFolder(folder);
    setQuery('');
    goTo('confirm', step);
  };

  const handleConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!rawFolder || !destFolder) return;
    const origin = event.currentTarget;
    setStep('saving');
    setError(null);
    try {
      await api.saveConfig(rawFolder.id, destFolder.id);
    } catch (err) {
      setError(errorMessage(err, 'Failed to save your folders'));
      setStep('confirm');
      return;
    }

    // Folders are saved either way; a refused watch shouldn't strand the user here.
    let notice: string | null = null;
    try {
      await api.startWatch();
    } catch (err) {
      notice = friendlyWatchError(errorMessage(err, 'Automatic sorting couldn’t start'));
    }

    if (!notice) await burstConfetti(origin);
    navigate('/dashboard', { state: notice ? { notice } : undefined });
  };

  useGSAP(
    () => {
      if (!pageRef.current) return;
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
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const pill = pageRef.current!.querySelector('[data-flip-id="active-step"]');
        if (pillState.current && pill) {
          Flip.from(pillState.current, { targets: pill, duration: 0.6, ease: 'power3.inOut' });
        }
        pillState.current = null;
        gsap.fromTo(
          stepRef.current,
          { autoAlpha: 0, x: 48 * direction.current },
          { autoAlpha: 1, x: 0, duration: 0.55, ease: 'power3.out' },
        );
        const icon = stepRef.current?.querySelector('.step-hero-icon');
        if (icon) gsap.from(icon, { scale: 0, rotation: -40, duration: 0.8, ease: 'back.out(2.5)', delay: 0.1 });
      });
      return () => mm.revert();
    },
    { dependencies: [view, loadError], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const items = gsap.utils.toArray<HTMLElement>('.folder-item', pageRef.current);
      if (foldersLoading || items.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(items, { y: 14, autoAlpha: 0, duration: 0.4, stagger: 0.035, ease: 'power2.out' });
      });
      return () => mm.revert();
    },
    { dependencies: [folders, foldersLoading], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        if (rawFolder) gsap.from('[data-chip="raw"]', { scale: 0.5, autoAlpha: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
      });
      return () => mm.revert();
    },
    { dependencies: [rawFolder?.id], scope: pageRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        if (destFolder) gsap.from('[data-chip="dest"]', { scale: 0.5, autoAlpha: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
      });
      return () => mm.revert();
    },
    { dependencies: [destFolder?.id], scope: pageRef, revertOnUpdate: true },
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

  const allFolders = folders ?? [];
  const visibleFolders = step === 'dest' ? allFolders.filter((f) => f.id !== rawFolder?.id) : allFolders;
  const showFolderSkeleton = foldersLoading || folders === null;

  return (
    <div ref={pageRef} className="min-h-screen">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <Link to="/dashboard" className="rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink">
          Dashboard
        </Link>
      </div>

      <main className="px-4 pb-16 pt-4 sm:pt-10">
        <div className="onboarding-card mx-auto w-full max-w-2xl rounded-[2rem] border border-line bg-white p-5 shadow-lift sm:p-10">
          <ol ref={stepperRef} className="mb-6 grid grid-cols-4 gap-1 rounded-2xl bg-lavender-soft p-1.5">
            {STEPS.map((item, i) => {
              const active = i === stepIndex;
              const done = i < stepIndex;
              return (
                <li key={item.label} className="relative" aria-current={active ? 'step' : undefined}>
                  {active && <span data-flip-id="active-step" className="absolute inset-0 rounded-xl bg-white shadow-soft" />}
                  <span className={`relative flex items-center justify-center gap-2 px-1 py-2 text-sm font-bold ${active || done ? 'text-ink' : 'text-ink-soft'}`}>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ${done ? 'bg-sage' : active ? 'bg-lavender' : 'bg-white/80'}`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <item.icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="hidden md:inline">{item.label}</span>
                    <span className="sr-only md:hidden">{item.label}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          {(rawFolder || destFolder) && (
            <div className="mb-6 flex flex-wrap gap-2">
              {rawFolder && (
                <span data-chip="raw" className="inline-flex items-center gap-1.5 rounded-full bg-butter-soft px-3 py-1 text-xs font-bold">
                  <FolderInput className="h-3.5 w-3.5" /> Raw: {rawFolder.name}
                </span>
              )}
              {destFolder && (
                <span data-chip="dest" className="inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-xs font-bold">
                  <FolderCheck className="h-3.5 w-3.5" /> Destination: {destFolder.name}
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
              {error}
            </div>
          )}

          <div ref={stepRef}>
            {loadError ? (
              <div className="py-6 text-center">
                <div className="step-hero-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose">
                  <CircleAlert className="h-8 w-8 text-rose-ink" />
                </div>
                <h2 className="mb-2 text-2xl font-bold">We couldn’t load your account</h2>
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
                <h2 className="mb-3 text-3xl font-bold tracking-tight">Connect Google Drive</h2>
                <p className="mx-auto mb-8 max-w-md leading-relaxed text-ink-soft">
                  DriveTag needs its own Drive permission, separate from your login, so it can keep sorting while you’re
                  away. You can disconnect anytime.
                </p>
                <Button onClick={handleConnectDrive} size="lg" magnetic>
                  Connect Google Drive <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : step === 'raw' || step === 'dest' ? (
              <div>
                <div className="mb-6 text-center">
                  <div
                    className={`step-hero-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl ${step === 'raw' ? 'bg-butter' : 'bg-sage'}`}
                  >
                    {step === 'raw' ? <FolderInput className="h-8 w-8 text-ink" /> : <FolderCheck className="h-8 w-8 text-ink" />}
                  </div>
                  <h2 className="mb-3 text-3xl font-bold tracking-tight">
                    {step === 'raw' ? 'Pick your Raw folder' : 'Pick your Destination'}
                  </h2>
                  <p className="mx-auto max-w-md leading-relaxed text-ink-soft">
                    {step === 'raw'
                      ? 'The folder where you and your team drop unsorted images. DriveTag watches it for new files.'
                      : 'Where tagged, renamed images should end up. It has to be different from your Raw folder.'}
                  </p>
                </div>

                <label className="relative mb-3 block">
                  <span className="sr-only">Search folders</span>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your folders…"
                    className="w-full rounded-2xl border border-line bg-canvas py-3 pl-11 pr-4 text-sm font-semibold text-ink placeholder:text-ink-soft focus:border-lavender focus:outline-none focus:ring-4 focus:ring-lavender/40"
                  />
                </label>

                <div className="max-h-72 overflow-y-auto rounded-2xl border border-line p-1.5">
                  {showFolderSkeleton ? (
                    <div className="space-y-1.5 p-1" role="status" aria-label="Loading folders">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Skeleton key={i} className="h-11" />
                      ))}
                    </div>
                  ) : visibleFolders.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-ink-soft">
                      <Inbox className="h-8 w-8 text-lavender-deep" />
                      {query ? `No folders match “${query}”.` : 'No folders found in your Drive.'}
                    </div>
                  ) : (
                    visibleFolders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => (step === 'raw' ? pickRaw(folder) : pickDest(folder))}
                        className="folder-item group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors hover:bg-lavender-soft focus-visible:bg-lavender-soft focus-visible:outline-none"
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${step === 'raw' ? 'bg-butter-soft' : 'bg-sage-soft'}`}>
                          <Folder className="h-4 w-4" />
                        </span>
                        <span className="flex-1 truncate">{folder.name}</span>
                        <ChevronRight className="h-4 w-4 text-ink-soft transition-transform group-hover:translate-x-1" />
                      </button>
                    ))
                  )}
                </div>

                {step === 'dest' && (
                  <div className="mt-4">
                    <Button variant="ghost" size="sm" onClick={() => goTo('raw', step)}>
                      <ArrowLeft className="h-4 w-4" /> Change Raw folder
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center">
                <div className="step-hero-icon mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-butter to-rose shadow-soft">
                  <PartyPopper className="h-9 w-9 text-ink" />
                </div>
                <h2 className="mb-3 text-3xl font-bold tracking-tight">Ready to go live</h2>
                <p className="mx-auto mb-7 max-w-md leading-relaxed text-ink-soft">
                  From now on, new images dropped into <strong className="text-ink">{rawFolder?.name}</strong> get tagged,
                  renamed, and moved into <strong className="text-ink">{destFolder?.name}</strong>. Images already in there
                  wait on your dashboard until you choose <strong className="text-ink">Organize now</strong>.
                </p>

                <div className="mx-auto mb-8 flex max-w-md items-center gap-3">
                  <div className="flex-1 rounded-2xl bg-butter-soft p-4 text-left">
                    <FolderInput className="mb-2 h-5 w-5" />
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Raw</p>
                    <p className="truncate font-bold">{rawFolder?.name}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-lavender-deep" />
                  <div className="flex-1 rounded-2xl bg-sage-soft p-4 text-left">
                    <FolderCheck className="mb-2 h-5 w-5" />
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Destination</p>
                    <p className="truncate font-bold">{destFolder?.name}</p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <Button onClick={handleConfirm} disabled={step === 'saving'} size="lg" magnetic className="w-full max-w-sm">
                    {step === 'saving' ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" /> Starting…
                      </>
                    ) : (
                      <>
                        Start organizing <Sparkles className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => goTo('raw', step)} disabled={step === 'saving'}>
                    Choose different folders
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
