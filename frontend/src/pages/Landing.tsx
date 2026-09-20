import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  FileText,
  FolderCheck,
  Gift,
  HardDrive,
  Images,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatCount } from '../lib/format';
import { gsap, useGSAP, ScrollTrigger, SplitText, MOTION_OK } from '../lib/gsap';
import { useReveal } from '../hooks/useReveal';
import { usePlans } from '../hooks/usePlans';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Logo } from '../components/ui/Logo';
import { ButtonLink } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { BetaBanner } from '../components/BetaBanner';
import { TagFlowIllustration } from '../components/TagFlowIllustration';
import { MemoryDemo } from '../components/MemoryDemo';
import { DocumentFlowIllustration } from '../components/DocumentFlowIllustration';
import { PageCapIllustration } from '../components/PageCapIllustration';
import { LandingPricingSection } from '../components/billing/LandingPricingSection';
import { freeImageAllowance } from '../components/billing/planFeatures';

const STEPS = [
  {
    icon: UploadCloud,
    bubble: 'bg-lavender',
    title: 'Drop it in',
    description:
      'Drag images and documents into a Raw folder in Google Drive, from any device. No app to install, no upload screen.',
  },
  {
    icon: Sparkles,
    bubble: 'bg-butter',
    title: 'The AI reads it',
    description:
      'The moment a file lands, our AI reads it in memory — the pixels of an image, or the first pages of a document — fills in your tags, and picks the destination that matches your descriptions, in seconds.',
  },
  {
    icon: FolderCheck,
    bubble: 'bg-sage',
    title: 'Auto-organized',
    description: 'It’s renamed with your naming template and moved into the destination folder the AI picked. You never touch it.',
  },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    bubble: 'bg-lavender-soft',
    title: 'Zero-Retention by design',
    description:
      'Images and documents are processed in memory and discarded the instant the move completes — never written to a database or storage bucket.',
  },
  {
    icon: HardDrive,
    bubble: 'bg-periwinkle-soft',
    title: 'Your Drive, not another silo',
    description: 'No new storage to manage. DriveTag works inside the Google Drive you and your clients already use.',
  },
  {
    icon: Zap,
    bubble: 'bg-butter-soft',
    title: 'Powered by advanced AI',
    description: 'Fast, consistent classification on every image and document, without anyone having to open it.',
  },
  {
    icon: Users,
    bubble: 'bg-sage-soft',
    title: 'Built for agencies & freelancers',
    description:
      'Run a work process per client or project for the daily flood of shoots, invoices, and deliverables that pile up in shared folders.',
  },
];

const PRIVACY_POINTS = [
  'Images and documents are processed in memory — never written to disk, a database, or a storage bucket.',
  'Sent to the AI inside the request itself — never uploaded to a file store.',
  'For a document, the AI reads only its first few pages — never the whole file.',
  'The AI provider doesn’t use your files to train its models.',
  'We keep only what your history needs: filenames, tags, and status.',
  'Disconnect anytime — we revoke Google access and delete your stored token.',
];

const FLOATING_TAGS = ['portrait', 'invoice', 'product', 'contract', 'event', 'brief'];

interface SortExample {
  before: string;
  after: string;
  destination: string;
}

const IMAGE_SORT_EXAMPLES: SortExample[] = [
  { before: 'IMG_4821.jpg', after: 'portrait_woman-smiling.jpg', destination: 'Portraits' },
  { before: 'DSC_0192.png', after: 'product_ceramic-mug.png', destination: 'Product shots' },
];

const DOCUMENT_SORT_EXAMPLES: SortExample[] = [
  { before: 'Scan_0042.pdf', after: 'invoice_acme_2026-08-31.pdf', destination: 'Invoices' },
  { before: 'contract (draft) v3.docx', after: 'contract_northwind_nda.docx', destination: 'Contracts' },
];

const DOCUMENT_TYPES = ['PDF', 'Word (.docx)', 'Google Docs', 'Sheets', 'Slides', 'Text, Markdown & CSV'];

export default function Landing() {
  useDocumentTitle('Auto-organize your Google Drive');
  const { user } = useAuth();
  const pageRef = useRef<HTMLDivElement>(null);
  const ctaHref = user ? '/dashboard' : '/login';
  const ctaLabel = user ? 'Go to dashboard' : 'Get started free';
  const { plans, error: plansError } = usePlans();
  const freeImages = formatCount(freeImageAllowance(plans));
  // The Free plan's lifetime document allowance — same "don't hard-code limits" rule as freeImageAllowance above.
  const freeDocuments = formatCount(plans?.plans.find((p) => p.id === 'free')?.freeDocuments ?? 25);
  const pagesRead = plans?.fileLimits.pagesRead ?? 5;
  const textChars = plans?.fileLimits.textChars ?? 12000;
  // Pricing hides itself if plans can't load; the rest of the page doesn't depend on it.
  const pricingState = plansError ? 'hidden' : plans ? 'ready' : 'loading';

  useReveal(pageRef);

  // The pricing section fills in (or disappears) after scroll triggers below it were measured.
  useEffect(() => {
    ScrollTrigger.refresh();
  }, [pricingState]);

  useGSAP(
    () => {
      const nav = pageRef.current!.querySelector<HTMLElement>('.site-nav')!;
      ScrollTrigger.create({
        start: 'top -12',
        end: 'max',
        onToggle: (self) => {
          nav.dataset.scrolled = String(self.isActive);
        },
      });

      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const split = SplitText.create('.hero-title', { type: 'words,chars', ignore: '.squiggle' });

        gsap
          .timeline({ defaults: { ease: 'back.out(1.7)' } })
          .from('.nav-item', { y: -24, autoAlpha: 0, stagger: 0.07, duration: 0.6 })
          .from('.hero-badge', { scale: 0.6, autoAlpha: 0, duration: 0.6 }, '<0.2')
          .from(
            split.chars,
            { y: 60, autoAlpha: 0, rotation: () => gsap.utils.random(-25, 25), duration: 0.7, stagger: 0.025 },
            '<0.15',
          )
          .from('.squiggle path', { drawSVG: 0, duration: 0.8, ease: 'power2.inOut' }, '-=0.3')
          .from('.hero-sub', { y: 24, autoAlpha: 0, duration: 0.6, ease: 'power3.out' }, '<')
          .from('.hero-cta > *', { y: 20, autoAlpha: 0, stagger: 0.1, duration: 0.6 }, '<0.15')
          .from('.hero-note', { y: 14, scale: 0.9, autoAlpha: 0, duration: 0.55 }, '<0.2')
          .from('.hero-trust > *', { y: 12, autoAlpha: 0, stagger: 0.08, duration: 0.5 }, '<0.2')
          .from('.hero-art', { x: 40, autoAlpha: 0, duration: 1, ease: 'power3.out' }, 0.3);

        gsap.from('.step-icon', {
          scale: 0,
          rotation: -60,
          duration: 0.8,
          stagger: 0.2,
          ease: 'back.out(2.4)',
          scrollTrigger: { trigger: '.steps-grid', start: 'top 80%' },
        });

        gsap.utils.toArray<HTMLElement>('.floating-tag', pageRef.current).forEach((tag, i) => {
          gsap.to(tag, {
            y: 'random(-18, 18)',
            x: 'random(-12, 12)',
            rotation: 'random(-8, 8)',
            duration: 'random(2.5, 4)',
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
            repeatRefresh: true,
            delay: i * 0.2,
          });
        });

        SplitText.create('.cta-title', {
          type: 'words',
          onSplit: (self) =>
            gsap.from(self.words, {
              y: 30,
              autoAlpha: 0,
              stagger: 0.06,
              duration: 0.6,
              ease: 'back.out(2)',
              scrollTrigger: { trigger: '.cta-banner', start: 'top 80%' },
            }),
        });
      });

      mm.add(`${MOTION_OK} and (min-width: 768px)`, () => {
        gsap.fromTo(
          '.steps-path',
          { drawSVG: '0%' },
          {
            drawSVG: '100%',
            ease: 'none',
            scrollTrigger: { trigger: '.steps-grid', start: 'top 75%', end: 'bottom 60%', scrub: 1 },
          },
        );
      });

      return () => mm.revert();
    },
    { scope: pageRef },
  );

  return (
    <div ref={pageRef} className="min-h-screen overflow-x-clip">
      <BetaBanner />
      <header
        className="site-nav sticky top-0 z-40 border-b border-transparent transition-[background-color,box-shadow,border-color] duration-300 data-[scrolled=true]:border-line data-[scrolled=true]:bg-white/75 data-[scrolled=true]:shadow-soft data-[scrolled=true]:backdrop-blur-md"
        data-scrolled="false"
      >
        <nav aria-label="Main" className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 py-3">
          <div className="nav-item">
            <Logo />
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="nav-item hidden rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 sm:inline-block">
              How it works
            </a>
            <a href="#privacy" className="nav-item hidden rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 sm:inline-block">
              Zero-Retention
            </a>
            {/* One element either way, so the entrance animation keeps its target when plans fail to load. */}
            <a
              href={pricingState === 'hidden' ? '/plans' : '#pricing'}
              className="nav-item hidden rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 sm:inline-block"
            >
              Pricing
            </a>
            {!user && (
              <div className="nav-item">
                <ButtonLink to="/login" variant="ghost" size="sm">
                  Log in
                </ButtonLink>
              </div>
            )}
            <div className="nav-item">
              <ButtonLink to={ctaHref} size="sm">
                {user ? 'Dashboard' : 'Get started'}
              </ButtonLink>
            </div>
          </div>
        </nav>
      </header>

      <main id="main-content">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:pt-16 lg:grid-cols-2 lg:gap-8 lg:pb-28">
          <div className="text-center lg:text-left">
            <div className="hero-badge mb-7 inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-bold shadow-soft">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-80 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-sage-deep" />
              </span>
              Zero-Retention — DriveTag never stores your files
            </div>

            <h1 className="hero-title mb-6 text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Your Drive,{' '}
              <span className="relative isolate inline-block whitespace-nowrap">
                auto-organized.
                <svg
                  aria-hidden
                  className="squiggle absolute -bottom-1 left-0 -z-10 h-5 w-full"
                  viewBox="0 0 300 20"
                  preserveAspectRatio="none"
                  fill="none"
                >
                  <path d="M4 13 C 50 3, 90 19, 150 11 S 250 5, 296 12" stroke="#ffe7a0" strokeWidth="12" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p className="hero-sub mx-auto mb-9 max-w-xl text-lg leading-relaxed text-ink-soft lg:mx-0">
              DriveTag AI watches one Raw folder in your Google Drive, or many, each with its own AI work process. It reads
              every image and document the moment it arrives, sorts it into destination folders you describe in plain
              words, and names it your way with your own tags — so nobody sorts client files by hand again.
            </p>

            <div className="hero-cta flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <ButtonLink to={ctaHref} size="lg" magnetic>
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink to="#how" variant="secondary" size="lg">
                See how it works
              </ButtonLink>
            </div>

            <p className="hero-note mt-6 inline-flex items-center gap-2 rounded-2xl bg-butter-soft px-4 py-2 text-left text-sm font-bold text-ink sm:rounded-full">
              <Gift className="h-4 w-4 shrink-0" aria-hidden />
              Free for your first {freeImages} images and {freeDocuments} documents — no credit card, no time limit
            </p>

            <ul className="hero-trust mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-soft lg:justify-start">
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-lavender-deep" /> Zero-Retention
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-lavender-deep" /> AI-powered tagging
              </li>
              <li className="inline-flex items-center gap-1.5">
                <FolderCheck className="h-4 w-4 text-lavender-deep" /> Works in your Drive
              </li>
            </ul>
          </div>

          <div className="hero-art">
            <TagFlowIllustration />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
          <p data-reveal className="mb-3 text-center text-sm font-extrabold uppercase tracking-widest text-ink-soft">
            How it works
          </p>
          <h2 data-reveal className="mb-4 text-center text-4xl font-bold tracking-tight sm:text-5xl">
            Three steps. Only the first is yours.
          </h2>
          <p data-reveal className="mx-auto mb-16 max-w-xl text-center text-lg text-ink-soft">
            Set it up once, then keep dropping files where you already do.
          </p>

          <div className="steps-grid relative grid gap-6 md:grid-cols-3">
            <svg
              aria-hidden
              className="pointer-events-none absolute left-[16%] right-[16%] top-10 hidden h-16 md:block"
              viewBox="0 0 600 60"
              preserveAspectRatio="none"
              fill="none"
            >
              <path
                className="steps-path"
                d="M0 30 C 100 -10, 200 70, 300 30 S 500 -10, 600 30"
                stroke="#b9a6ff"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            {STEPS.map((step, i) => (
              <Card key={step.title} data-reveal interactive className="relative p-7 text-center">
                <div className={`step-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl ${step.bubble} shadow-soft`}>
                  <step.icon className="h-7 w-7 text-ink" />
                </div>
                <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">Step {i + 1}</span>
                <h3 className="mb-2 mt-1 text-2xl font-semibold">{step.title}</h3>
                <p className="leading-relaxed text-ink-soft">{step.description}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* What DriveTag sorts */}
        <section id="sorts" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
          <p data-reveal className="mb-3 text-center text-sm font-extrabold uppercase tracking-widest text-ink-soft">
            What DriveTag sorts
          </p>
          <h2 data-reveal className="mb-4 text-center text-4xl font-bold tracking-tight sm:text-5xl">
            One flow. Every file your clients send.
          </h2>
          <p data-reveal className="mx-auto mb-16 max-w-xl text-center text-lg text-ink-soft">
            Images and documents both land in a Raw folder and come out named, tagged, and filed — no separate tool,
            no separate habit to learn.
          </p>

          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div data-reveal>
              <h3 className="mb-3 text-2xl font-semibold">Now it reads documents too</h3>
              <p className="mb-5 leading-relaxed text-ink-soft">
                PDFs, Word files, Google Docs, Sheets and Slides, and plain text or Markdown files move through the
                same flow DriveTag already uses for photos: dropped in Raw, read in memory, renamed with your
                template, and filed into the folder that matches. DriveTag reads only the first {pagesRead} pages of
                a PDF — about {formatCount(textChars)} characters of text otherwise — so a five-page brief and a
                two-hundred-page report cost the same to sort.
              </p>
              <ul className="flex flex-wrap gap-2">
                {DOCUMENT_TYPES.map((type) => (
                  <li key={type} className="rounded-full bg-line px-3 py-1 text-xs font-bold text-ink-soft">
                    {type}
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal>
              <DocumentFlowIllustration pagesRead={pagesRead} />
            </div>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-2">
            <Card data-reveal className="p-7">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-periwinkle-soft">
                <Images className="h-6 w-6 text-ink" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Images</h3>
              <p className="mb-4 leading-relaxed text-ink-soft">
                Shoots, product photos, screenshots — tagged by what’s in them.
              </p>
              <ul className="space-y-2">
                {IMAGE_SORT_EXAMPLES.map((example) => (
                  <li
                    key={example.before}
                    className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-canvas px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-ink-soft line-through decoration-1">{example.before}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden />
                    <span className="min-w-0 truncate font-semibold">{example.after}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-lavender-soft px-2 py-0.5 text-xs font-bold">
                      {example.destination}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card data-reveal className="p-7">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-lavender-soft">
                <FileText className="h-6 w-6 text-ink" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Documents</h3>
              <p className="mb-4 leading-relaxed text-ink-soft">
                Invoices, contracts, briefs and reports — named by what they say.
              </p>
              <ul className="space-y-2">
                {DOCUMENT_SORT_EXAMPLES.map((example) => (
                  <li
                    key={example.before}
                    className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-canvas px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-ink-soft line-through decoration-1">{example.before}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden />
                    <span className="min-w-0 truncate font-semibold">{example.after}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-periwinkle-soft px-2 py-0.5 text-xs font-bold">
                      {example.destination}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div data-reveal className="mt-16">
            <PageCapIllustration pagesRead={pagesRead} textChars={textChars} />
          </div>
        </section>

        {/* Zero-Retention */}
        <section id="privacy" className="mx-auto grid max-w-6xl scroll-mt-24 items-center gap-12 px-4 py-20 lg:grid-cols-2">
          <div>
            <p data-reveal className="mb-3 text-sm font-extrabold uppercase tracking-widest text-ink-soft">
              Zero-Retention
            </p>
            <h2 data-reveal className="mb-5 text-4xl font-bold tracking-tight sm:text-5xl">
              Your images and documents pass through. They never stay.
            </h2>
            <p data-reveal className="mb-8 text-lg leading-relaxed text-ink-soft">
              Client work is sensitive. DriveTag looks at each file just long enough to name and file it, then lets it go.
            </p>
            <ul className="space-y-4">
              {PRIVACY_POINTS.map((point) => (
                <li key={point} data-reveal className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage">
                    <Check className="h-3.5 w-3.5 text-ink" strokeWidth={3} />
                  </span>
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
            <p data-reveal className="mt-6 text-sm leading-relaxed text-ink-soft">
              Like other major AI providers, ours may keep request logs for a limited time (up to 55 days) solely to
              prevent abuse — never to train models. Full details in the{' '}
              <Link to="/privacy#zero-retention" className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <div data-reveal>
            <MemoryDemo />
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 data-reveal className="mb-14 text-center text-4xl font-bold tracking-tight sm:text-5xl">
            Why teams trust DriveTag
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <Card key={feature.title} data-reveal interactive className="group p-7">
                <div
                  className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${feature.bubble} transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110`}
                >
                  <feature.icon className="h-6 w-6 text-ink" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
                <p className="leading-relaxed text-ink-soft">{feature.description}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Pricing */}
        {pricingState !== 'hidden' && (
          <section id="pricing" aria-labelledby="pricing-heading" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
            <p data-reveal className="mb-3 text-center text-sm font-extrabold uppercase tracking-widest text-ink-soft">
              Pricing
            </p>
            <h2 data-reveal id="pricing-heading" className="mb-4 text-center text-4xl font-bold tracking-tight sm:text-5xl">
              Start free. Grow when you’re ready.
            </h2>
            <p data-reveal className="mx-auto mb-14 max-w-xl text-center text-lg text-ink-soft">
              Your first {freeImages} images and {freeDocuments} documents are free with no time limit. Paid plans add
              work processes and a fresh allowance every month.
            </p>

            <LandingPricingSection plans={plans} signedIn={Boolean(user)} />
          </section>
        )}

        {/* CTA */}
        <section className="mx-auto max-w-5xl px-4 py-20">
          <div
            data-reveal
            className="cta-banner relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-lavender via-periwinkle to-sage px-6 py-16 text-center shadow-lift sm:px-14"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 hidden sm:block">
              {FLOATING_TAGS.map((tag, i) => (
                <span
                  key={tag}
                  className="floating-tag absolute rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-ink/70"
                  style={{
                    left: `${[4, 82, 6, 84, 22, 68][i]}%`,
                    top: `${[7, 6, 76, 74, 84, 84][i]}%`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="cta-title relative mx-auto mb-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
              Stop organizing assets by hand.
            </h2>
            <p className="relative mx-auto mb-9 max-w-lg text-lg text-ink/80">
              Connect your Drive once. Your first {freeImages} images and {freeDocuments} documents are free — no credit
              card, no time limit.
            </p>
            <div className="relative">
              <ButtonLink to={ctaHref} variant="secondary" size="lg" magnetic>
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
