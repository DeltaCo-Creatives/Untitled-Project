import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { gsap, useGSAP, MOTION_OK, REDUCED_MOTION } from '../lib/gsap';
import { Logo } from '../components/ui/Logo';
import { ButtonLink } from '../components/ui/Button';

const SUCCESS_DELAY_MS = 1600;
const ERROR_DELAY_MS = 5000;

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You closed the Google permission screen before granting access.',
  invalid_state: 'That connection link expired or was already used. Please try again.',
  exchange_failed: 'Google didn’t hand back access this time. Please try again.',
};

const BURST_COLORS = ['bg-lavender', 'bg-periwinkle', 'bg-butter', 'bg-sage', 'bg-rose'];

export default function Connect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const error = searchParams.get('error');
  const message = error ? (ERROR_MESSAGES[error] ?? `Google returned: ${error}`) : null;
  const delay = error ? ERROR_DELAY_MS : SUCCESS_DELAY_MS;

  useEffect(() => {
    const timer = setTimeout(() => navigate('/onboarding', { replace: true }), delay);
    return () => clearTimeout(timer);
  }, [delay, navigate]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(REDUCED_MOTION, () => {
        gsap.set('.progress-fill', { scaleX: 1 });
      });

      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ defaults: { ease: 'back.out(1.7)' } });
        tl.from('.connect-card', { y: 30, scale: 0.94, autoAlpha: 0, duration: 0.7 })
          .from('.status-ring', { drawSVG: 0, duration: 0.7, ease: 'power2.inOut' }, '<0.2')
          .from('.status-mark', { drawSVG: 0, duration: 0.45, ease: 'power2.out' }, '>-0.1')
          .from('.connect-card [data-enter]', { y: 14, autoAlpha: 0, stagger: 0.08, duration: 0.5 }, '<');

        if (error) {
          tl.to('.connect-card', { keyframes: { x: [0, -10, 9, -6, 4, 0] }, duration: 0.5, ease: 'power1.out' }, '<');
        } else {
          tl.fromTo(
            '.burst-dot',
            { x: 0, y: 0, scale: 0, autoAlpha: 1 },
            {
              x: (i: number) => Math.cos((i / 12) * Math.PI * 2) * gsap.utils.random(60, 95),
              y: (i: number) => Math.sin((i / 12) * Math.PI * 2) * gsap.utils.random(60, 95),
              scale: () => gsap.utils.random(0.6, 1.2),
              autoAlpha: 0,
              duration: 0.9,
              ease: 'power3.out',
            },
            '<',
          );
        }

        gsap.fromTo('.progress-fill', { scaleX: 0 }, { scaleX: 1, duration: delay / 1000, ease: 'none' });
      });

      return () => mm.revert();
    },
    { scope: pageRef },
  );

  return (
    <div ref={pageRef} className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <Logo />
      </div>
      <main className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="connect-card w-full max-w-md rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
          <div className="relative mx-auto mb-6 h-24 w-24">
            {!error &&
              Array.from({ length: 12 }, (_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={`burst-dot invisible absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full opacity-0 ${BURST_COLORS[i % BURST_COLORS.length]}`}
                />
              ))}
            <svg viewBox="0 0 96 96" className="h-24 w-24" aria-hidden>
              <circle cx="48" cy="48" r="44" className={error ? 'fill-rose-soft' : 'fill-sage-soft'} />
              <circle
                className="status-ring"
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke={error ? '#8a2340' : '#3f7a52'}
                strokeWidth="5"
                strokeLinecap="round"
              />
              {error ? (
                <path className="status-mark" d="M36 36 L60 60 M60 36 L36 60" fill="none" stroke="#8a2340" strokeWidth="6" strokeLinecap="round" />
              ) : (
                <path className="status-mark" d="M32 49 L43 60 L65 37" fill="none" stroke="#3f7a52" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </div>

          <h1 data-enter className="mb-3 text-3xl font-bold tracking-tight">
            {error ? 'Couldn’t connect Google Drive' : 'Google Drive connected!'}
          </h1>
          <p data-enter role={error ? 'alert' : 'status'} className="mb-7 leading-relaxed text-ink-soft">
            {message ?? 'Nice — next, pick the folders DriveTag should watch and sort into.'}
          </p>

          <div data-enter className="mb-6 h-2 overflow-hidden rounded-full bg-lavender-soft">
            <div className={`progress-fill h-full origin-left scale-x-0 rounded-full ${error ? 'bg-rose' : 'bg-lavender'}`} />
          </div>

          <div data-enter>
            <ButtonLink to="/onboarding" variant={error ? 'primary' : 'secondary'}>
              {error ? 'Try again' : 'Continue now'}
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}
