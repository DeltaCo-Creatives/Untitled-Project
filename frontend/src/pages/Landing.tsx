import { useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  FolderCheck,
  HardDrive,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { gsap, useGSAP, ScrollTrigger, SplitText, MOTION_OK } from '../lib/gsap';
import { useReveal } from '../hooks/useReveal';
import { Logo } from '../components/ui/Logo';
import { ButtonLink } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TagFlowIllustration } from '../components/TagFlowIllustration';
import { MemoryDemo } from '../components/MemoryDemo';

const STEPS = [
  {
    icon: UploadCloud,
    bubble: 'bg-lavender',
    title: 'Drop it in',
    description: 'Drag images into your Raw folder in Google Drive, from any device. No app to install, no upload screen.',
  },
  {
    icon: Sparkles,
    bubble: 'bg-butter',
    title: 'Gemini tags it',
    description: 'The moment a file lands, Gemini Flash reads its genre, subject, and style — in memory, in seconds.',
  },
  {
    icon: FolderCheck,
    bubble: 'bg-sage',
    title: 'Auto-organized',
    description: 'It’s renamed to something you can search and moved into your Destination folder. You never touch it.',
  },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    bubble: 'bg-lavender-soft',
    title: 'Zero-Retention by design',
    description: 'Images are processed in memory and discarded the instant the move completes — never written to a database or storage bucket.',
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
    title: 'Powered by Gemini Flash',
    description: 'Fast, consistent visual classification on every image, without anyone having to open it.',
  },
  {
    icon: Users,
    bubble: 'bg-sage-soft',
    title: 'Built for agencies & freelancers',
    description: 'Made for the daily flood of shoots, drafts, and deliverables that pile up in one shared folder.',
  },
];

const PRIVACY_POINTS = [
  'Images are processed in memory — never written to disk, a database, or a storage bucket.',
  'Sent to Gemini inline, not through an upload API that would keep a copy.',
  'We keep only what your history needs: filenames, tags, and status.',
  'Disconnect anytime — we revoke Google access and delete your stored token.',
];

const FLOATING_TAGS = ['portrait', 'product', 'landscape', 'event', 'flat lay', 'golden hour'];

export default function Landing() {
  const { user } = useAuth();
  const pageRef = useRef<HTMLDivElement>(null);
  const ctaHref = user ? '/dashboard' : '/login';
  const ctaLabel = user ? 'Go to dashboard' : 'Get started free';

  useReveal(pageRef);

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
      <header
        className="site-nav sticky top-0 z-40 border-b border-transparent transition-[background-color,box-shadow,border-color] duration-300 data-[scrolled=true]:border-line data-[scrolled=true]:bg-white/75 data-[scrolled=true]:shadow-soft data-[scrolled=true]:backdrop-blur-md"
        data-scrolled="false"
      >
        <nav className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 py-3">
          <div className="nav-item">
            <Logo />
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="nav-item hidden rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink sm:inline-block">
              How it works
            </a>
            <a href="#privacy" className="nav-item hidden rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink sm:inline-block">
              Privacy
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

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:pt-16 lg:grid-cols-2 lg:gap-8 lg:pb-28">
          <div className="text-center lg:text-left">
            <div className="hero-badge mb-7 inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-bold shadow-soft">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-80 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-sage-deep" />
              </span>
              Zero-Retention — your images are never stored
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
              DriveTag AI watches one folder in your Google Drive, tags every image the moment it arrives, and files it
              away with a name you can actually search — so nobody sorts client assets by hand again.
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

            <ul className="hero-trust mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-soft lg:justify-start">
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-lavender-deep" /> Zero-Retention
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-lavender-deep" /> Gemini Flash tagging
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
          <p data-reveal className="mb-3 text-center text-sm font-extrabold uppercase tracking-widest text-lavender-deep">
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

        {/* Zero-Retention */}
        <section id="privacy" className="mx-auto grid max-w-6xl scroll-mt-24 items-center gap-12 px-4 py-20 lg:grid-cols-2">
          <div>
            <p data-reveal className="mb-3 text-sm font-extrabold uppercase tracking-widest text-lavender-deep">
              Zero-Retention
            </p>
            <h2 data-reveal className="mb-5 text-4xl font-bold tracking-tight sm:text-5xl">
              Your images pass through. They never stay.
            </h2>
            <p data-reveal className="mb-8 text-lg leading-relaxed text-ink-soft">
              Client work is sensitive. DriveTag looks at each image just long enough to name and file it, then lets it go.
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
            <p className="relative mx-auto mb-9 max-w-md text-lg text-ink/80">
              Connect your Drive once. DriveTag takes it from there.
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

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 border-t border-line px-4 py-10 sm:flex-row">
        <Logo size="sm" />
        <nav className="flex items-center gap-5 text-sm font-bold text-ink-soft">
          <a href="#how" className="hover:text-ink">
            How it works
          </a>
          <a href="#privacy" className="hover:text-ink">
            Privacy
          </a>
          <Link to={user ? '/dashboard' : '/login'} className="hover:text-ink">
            {user ? 'Dashboard' : 'Log in'}
          </Link>
        </nav>
        <p className="text-sm text-ink-soft">Zero-Retention by design.</p>
      </footer>
    </div>
  );
}
