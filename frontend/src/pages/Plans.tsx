import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Clock3,
  CreditCard,
  Hourglass,
  House,
  Images,
  Lock,
  PlugZap,
  RefreshCw,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, type MeResponse } from '../lib/api';
import { formatCount, plural } from '../lib/format';
import { gsap, useGSAP, ScrollTrigger, SplitText, MOTION_OK } from '../lib/gsap';
import { usePlans } from '../hooks/usePlans';
import { useReveal } from '../hooks/useReveal';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Logo } from '../components/ui/Logo';
import { Button, ButtonLink } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { PlanGrid } from '../components/billing/PlanGrid';
import { TopupPacks } from '../components/billing/TopupPacks';
import { UsageMeter } from '../components/billing/UsageMeter';
import { TransparencyNote } from '../components/billing/TransparencyNote';
import { DocumentPricingSection } from '../components/billing/DocumentPricing';
import { freeImageAllowance } from '../components/billing/planFeatures';

interface FaqItem {
  icon: LucideIcon;
  bubble: string;
  question: string;
  answer: string;
}

function faqItems(freeImages: number): FaqItem[] {
  return [
    {
      icon: Images,
      bubble: 'bg-lavender-soft',
      question: 'What counts as an image?',
      answer:
        'Each image DriveTag sorts counts once, whether it lands in one of your destinations or in Unsorted. Failures never count, so a retry only uses an image when it works.',
    },
    {
      icon: Hourglass,
      bubble: 'bg-butter-soft',
      question: 'What happens when I run out?',
      answer:
        'Nothing gets lost. New images simply wait in your Raw folder. Upgrade or add an image pack, then press “Organize now” on your process to sort everything that piled up.',
    },
    {
      icon: Workflow,
      bubble: 'bg-sage-soft',
      question: 'What’s an AI work process?',
      answer:
        'A Raw folder DriveTag watches, plus the destination folders it sorts into. You describe each destination in plain words and pick the naming, tags and instructions, so every client or project can have its own.',
    },
    {
      icon: CreditCard,
      bubble: 'bg-periwinkle-soft',
      question: 'Can I cancel anytime?',
      answer: `Payments launch soon, so there’s nothing to pay for or cancel yet. Free needs no credit card, and your ${formatCount(freeImages)} free images have no time limit.`,
    },
  ];
}

export default function Plans() {
  useDocumentTitle('Plans & pricing');
  const { user } = useAuth();
  const { plans, loading, error, retry } = usePlans();
  const pageRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Jumping here from elsewhere (e.g. Landing's "See document plans" link) lands on a hash the router doesn't
  // scroll to itself, and the target section only exists once plans have loaded.
  useEffect(() => {
    if (!location.hash || !plans) return;
    const id = location.hash.slice(1);
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash, plans]);

  const [me, setMe] = useState<MeResponse | null>(null);
  // Keyed by user so a failure for one session doesn't hide the usage card after switching accounts.
  const [meFailedFor, setMeFailedFor] = useState<string | null>(null);
  const userId = user?.id ?? null;
  const plansHeadingRef = useRef<HTMLHeadingElement>(null);

  // Only for highlighting the current plan and showing usage; the page works without it.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    api.me().then(
      (response) => {
        if (active) setMe(response);
      },
      () => {
        if (active) setMeFailedFor(userId);
      },
    );
    return () => {
      active = false;
    };
  }, [userId]);

  const meForUser = userId && me?.user.id === userId ? me : null;
  // A /api/me from an older backend has no processCounts; show the page without account details rather than crash.
  const account = meForUser?.processCounts ? meForUser : null;
  const meLoading = Boolean(userId) && !meForUser && meFailedFor !== userId;
  const lockedProcesses = account ? Math.max(0, account.processCounts.total - account.processCounts.max) : 0;

  // The Try again button unmounts while plans reload; keep keyboard focus in this section instead of the page top.
  const retryPlans = () => {
    plansHeadingRef.current?.focus();
    retry();
  };

  // No plan yet means Drive isn't connected, and everyone starts on Free.
  const currentPlanId = account ? (account.plan?.id ?? 'free') : null;
  const accountCard = account ? (account.plan && account.usage ? 'usage' : 'connect') : null;
  const freeImages = freeImageAllowance(plans);
  const faq = faqItems(freeImages);

  useReveal(pageRef, [Boolean(plans)]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const split = SplitText.create('.plans-title', { type: 'words,chars', ignore: '.squiggle' });
        gsap
          .timeline({ defaults: { ease: 'back.out(1.7)' } })
          .from('.plans-nav > *', { y: -20, autoAlpha: 0, stagger: 0.08, duration: 0.6 })
          .from('.plans-badge', { scale: 0.6, autoAlpha: 0, duration: 0.6 }, '<0.2')
          .from(
            split.chars,
            { y: 50, autoAlpha: 0, rotation: () => gsap.utils.random(-20, 20), duration: 0.7, stagger: 0.02 },
            '<0.15',
          )
          .from('.squiggle path', { drawSVG: 0, duration: 0.8, ease: 'power2.inOut' }, '-=0.3')
          .from('.plans-sub', { y: 20, autoAlpha: 0, duration: 0.6, ease: 'power3.out' }, '<');
      });
      return () => mm.revert();
    },
    { scope: pageRef },
  );

  // The usage card arrives after the page; pop it in and re-measure scroll positions below it.
  useGSAP(
    () => {
      ScrollTrigger.refresh();
      if (!accountCard) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.account-card', { y: 24, scale: 0.98, autoAlpha: 0, duration: 0.7, ease: 'back.out(1.6)' });
      });
      return () => mm.revert();
    },
    { dependencies: [accountCard, meLoading], scope: pageRef, revertOnUpdate: true },
  );

  return (
    <div ref={pageRef} className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-line bg-white/75 backdrop-blur-md">
        <div className="plans-nav mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo to={user ? '/dashboard' : '/'} size="sm" />
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            {user ? (
              <ButtonLink to="/dashboard" variant="secondary" size="sm">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Dashboard
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to="/" variant="ghost" size="sm">
                  <House className="h-4 w-4" aria-hidden />
                  Home
                </ButtonLink>
                <ButtonLink to="/login" size="sm">
                  Log in
                </ButtonLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main-content">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-4 pb-12 pt-12 text-center sm:pt-16">
          <p className="plans-badge mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-bold shadow-soft">
            <Clock3 className="h-3.5 w-3.5 text-lavender-deep" aria-hidden />
            Paid plans launch soon · Free works today
          </p>
          <h1 className="plans-title mb-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Plans that grow with{' '}
            <span className="relative isolate inline-block whitespace-nowrap">
              your pipeline
              <svg
                aria-hidden
                className="squiggle absolute -bottom-1 left-0 -z-10 h-4 w-full sm:h-5"
                viewBox="0 0 300 20"
                preserveAspectRatio="none"
                fill="none"
              >
                <path d="M4 13 C 50 3, 90 19, 150 11 S 250 5, 296 12" stroke="#ffe7a0" strokeWidth="12" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="plans-sub mx-auto max-w-xl text-lg leading-relaxed text-ink-soft">
            Your first {formatCount(freeImages)} images are free, with no credit card and no time limit. Sorting for more
            clients? Add work processes and a fresh image allowance every month.
          </p>
          {plans && (
            <nav aria-label="Jump to pricing section" className="plans-sub mt-6 flex items-center justify-center gap-2 text-sm font-bold text-ink-soft">
              <a href="#plans-heading" className="rounded-lg px-2 py-1 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
                Images
              </a>
              <span aria-hidden>·</span>
              <a href="#documents" className="rounded-lg px-2 py-1 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
                Documents
              </a>
            </nav>
          )}
        </section>

        {/* Signed-in usage */}
        {meLoading && (
          <div className="mx-auto mb-14 max-w-3xl px-4" role="status">
            <span className="sr-only">Loading your usage…</span>
            <Skeleton className="h-44" />
          </div>
        )}
        {account?.plan && account.usage && (
          <section aria-labelledby="usage-heading" className="mx-auto mb-14 max-w-3xl px-4">
            <div className="account-card rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-lavender to-periwinkle shadow-soft">
                    <Images className="h-6 w-6 text-ink" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">Your plan</p>
                    <h2 id="usage-heading" className="text-2xl font-bold tracking-tight">
                      {account.plan.label}
                    </h2>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-lavender-soft px-3 py-1.5 text-sm font-bold">
                  <Workflow className="h-4 w-4 text-lavender-deep" aria-hidden />
                  {formatCount(account.processCounts.total)} of {formatCount(account.processCounts.max)} work{' '}
                  {account.processCounts.max === 1 ? 'process' : 'processes'}
                </span>
              </div>
              {lockedProcesses > 0 && (
                <p className="mb-5 flex items-start gap-2 rounded-2xl bg-butter-soft px-4 py-3 text-sm font-semibold leading-relaxed text-ink">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {plural(lockedProcesses, 'work process is', 'work processes are')} locked because your plan covers{' '}
                    {formatCount(account.processCounts.max)}. They keep their settings and can still be edited or
                    deleted, but won’t run until your plan covers them.
                  </span>
                </p>
              )}
              <UsageMeter plan={account.plan} usage={account.usage} />
            </div>
          </section>
        )}
        {accountCard === 'connect' && (
          <section aria-labelledby="connect-heading" className="mx-auto mb-14 max-w-3xl px-4">
            <div className="account-card flex flex-col items-center gap-5 rounded-[2rem] border border-line bg-white p-6 text-center shadow-soft sm:flex-row sm:p-8 sm:text-left">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-butter shadow-soft">
                <PlugZap className="h-7 w-7 text-ink" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="connect-heading" className="text-xl font-bold tracking-tight">
                  You’re on Free
                </h2>
                <p className="mt-1 leading-relaxed text-ink-soft">
                  Connect Google Drive and set up your first work process to start sorting your{' '}
                  {formatCount(freeImages)} free images.
                </p>
              </div>
              <ButtonLink to="/dashboard" className="shrink-0">
                Finish setup
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            </div>
          </section>
        )}

        {/* Plans */}
        <section aria-labelledby="plans-heading" className="mx-auto max-w-6xl px-4 pb-20">
          <h2 ref={plansHeadingRef} id="plans-heading" tabIndex={-1} className="sr-only">
            Plans
          </h2>
          {loading ? (
            <div role="status">
              <span className="sr-only">Loading plans…</span>
              <Skeleton className="mx-auto mb-10 h-11 w-52" />
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[28rem]" />
                ))}
              </div>
            </div>
          ) : error || !plans ? (
            <div className="mx-auto max-w-lg rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-rose">
                <CircleAlert className="h-8 w-8 text-rose-ink" aria-hidden />
              </div>
              <h3 className="mb-2 text-2xl font-bold">We couldn’t load plans</h3>
              <p role="alert" className="mb-7 leading-relaxed text-ink-soft">
                {error ?? 'Something went wrong. Please try again.'}
              </p>
              <Button onClick={retryPlans} size="lg">
                <RefreshCw className="h-4 w-4" aria-hidden />
                Try again
              </Button>
            </div>
          ) : (
            <>
              <PlanGrid
                plans={plans.plans}
                currency={plans.currency}
                currentPlanId={currentPlanId}
                signedIn={Boolean(user)}
              />
              <TransparencyNote currency={plans.currency} className="mt-12" />
            </>
          )}
        </section>

        {/* Image packs */}
        {plans && plans.topupPacks.length > 0 && (
          <section aria-labelledby="packs-heading" className="mx-auto max-w-5xl px-4 pb-20">
            <div className="mb-10 text-center">
              <p data-reveal className="mb-3 text-sm font-extrabold uppercase tracking-widest text-ink-soft">
                Image packs
              </p>
              <h2 data-reveal id="packs-heading" className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Need a few more images?
              </h2>
              <p data-reveal className="mx-auto max-w-xl text-lg leading-relaxed text-ink-soft">
                Packs top up any plan, Free included. They never expire and only kick in once your plan’s allowance runs out.
              </p>
            </div>
            <TopupPacks packs={plans.topupPacks} currency={plans.currency} />
          </section>
        )}

        {/* Documents */}
        {plans && (
          <DocumentPricingSection
            documents={plans.documents}
            currency={plans.currency}
            imagePlans={plans.plans}
          />
        )}

        {/* FAQ */}
        <section aria-labelledby="faq-heading" className="mx-auto max-w-5xl px-4 pb-20">
          <h2 data-reveal id="faq-heading" className="mb-10 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Questions, answered
          </h2>
          <dl className="grid gap-5 md:grid-cols-2">
            {faq.map((item) => (
              <div key={item.question} data-reveal className="rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-7">
                <dt className="mb-2 flex items-center gap-3 font-display text-lg font-semibold">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.bubble}`}>
                    <item.icon className="h-5 w-5 text-ink" aria-hidden />
                  </span>
                  {item.question}
                </dt>
                <dd className="leading-relaxed text-ink-soft">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Closing */}
        <section className="mx-auto max-w-5xl px-4 pb-24">
          <div
            data-reveal
            className="flex flex-col items-center justify-between gap-5 rounded-[2rem] bg-gradient-to-br from-lavender via-periwinkle to-sage px-6 py-10 text-center shadow-lift sm:flex-row sm:px-10 sm:text-left"
          >
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {user ? 'Back to sorting?' : 'Ready when you are.'}
              </h2>
              <p className="mt-1 text-ink/80">
                {user
                  ? 'Your processes are waiting on the dashboard.'
                  : `Start with ${formatCount(freeImages)} free images. No credit card, no time limit.`}
              </p>
            </div>
            <ButtonLink to={user ? '/dashboard' : '/login'} variant="secondary" size="lg" magnetic className="shrink-0">
              {user ? 'Go to dashboard' : 'Get started free'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          </div>
        </section>
      </main>
    </div>
  );
}
