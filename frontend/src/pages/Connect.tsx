import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { gsap, useGSAP, MOTION_OK, REDUCED_MOTION } from '../lib/gsap';
import { errorMessage } from '../lib/messages';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Logo } from '../components/ui/Logo';
import { ButtonLink } from '../components/ui/Button';

const SUCCESS_DELAY_MS = 1600;
const ERROR_DELAY_MS = 5000;

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You closed the Google permission screen before granting access.',
  invalid_state: 'That connection link expired or was already used. Please try again.',
  exchange_failed: 'Google didn’t hand back access this time. Please try again.',
};

const MISMATCH_MESSAGE =
  'This Google Drive connection was started from a different DriveTag account. Sign in with that account, or start Connect Drive again from this one.';

const BURST_COLORS = ['bg-lavender', 'bg-periwinkle', 'bg-butter', 'bg-sage', 'bg-rose'];

/** `none`: /connect opened directly, with nothing to finish. */
type Phase = 'claiming' | 'success' | 'error' | 'none';

function claimErrorMessage(err: unknown) {
  if (err instanceof ApiError && err.code === 'drive_connect_mismatch') return MISMATCH_MESSAGE;
  if (err instanceof ApiError && err.code === 'connect_expired') return ERROR_MESSAGES.invalid_state;
  return errorMessage(err, 'We couldn’t finish connecting Google Drive. Please try again.');
}

export default function Connect() {
  useDocumentTitle('Connecting Google Drive');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const claimStarted = useRef(false);
  const mounted = useRef(false);

  // Read once: the pending id is removed from the URL after it's claimed.
  const [pending] = useState(() => searchParams.get('pending'));
  const [urlError] = useState(() => searchParams.get('error'));
  const [claimed, setClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const message = urlError ? (ERROR_MESSAGES[urlError] ?? `Google returned: ${urlError}`) : claimError;
  const phase: Phase = message ? 'error' : claimed ? 'success' : pending ? 'claiming' : 'none';
  const error = phase === 'error';
  const delay = error ? ERROR_DELAY_MS : SUCCESS_DELAY_MS;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The OAuth callback only parks the grant; Drive is connected once this signed-in user claims it. The ref keeps
  // StrictMode's second effect run from spending the one-time id twice.
  useEffect(() => {
    if (!pending || urlError || claimStarted.current) return;
    claimStarted.current = true;
    api
      .completeGoogleAuth(pending)
      .then(
        () => setClaimed(true),
        (err: unknown) => setClaimError(claimErrorMessage(err)),
      )
      .finally(() => {
        // Left the page mid-claim (e.g. via the logo): this relative navigation would pull the user back to /connect.
        if (!mounted.current) return;
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current);
            next.delete('pending');
            return next;
          },
          { replace: true },
        );
      });
  }, [pending, urlError, setSearchParams]);

  useEffect(() => {
    if (phase === 'claiming') return undefined;
    if (phase === 'none') {
      navigate('/onboarding', { replace: true });
      return undefined;
    }
    const timer = setTimeout(() => navigate('/onboarding', { replace: true }), delay);
    return () => clearTimeout(timer);
  }, [phase, delay, navigate]);

  useGSAP(
    () => {
      if (phase === 'none') return;
      const settled = phase !== 'claiming';
      // After a claim the card is already on screen; only its contents change.
      const cardEntered = settled && Boolean(pending);
      const mm = gsap.matchMedia();

      mm.add(REDUCED_MOTION, () => {
        if (settled) gsap.set('.progress-fill', { scaleX: 1 });
      });

      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ defaults: { ease: 'back.out(1.7)' } });
        if (!cardEntered) tl.from('.connect-card', { y: 30, scale: 0.94, autoAlpha: 0, duration: 0.7 });

        if (!settled) {
          tl.from('.connect-card [data-enter]', { y: 14, autoAlpha: 0, stagger: 0.08, duration: 0.5 }, '<0.2');
          gsap.to('.status-spinner', { rotation: 360, transformOrigin: '50% 50%', duration: 1, ease: 'none', repeat: -1 });
          return;
        }

        tl.from('.status-ring', { drawSVG: 0, duration: 0.7, ease: 'power2.inOut' }, cardEntered ? 0 : '<0.2')
          .from('.status-mark', { drawSVG: 0, duration: 0.45, ease: 'power2.out' }, '>-0.1')
          // opacity, not autoAlpha: after a claim the status line's text changes as this starts, and visibility:hidden
          // would keep screen readers from announcing the result.
          .from('.connect-card [data-enter]', { y: 14, opacity: 0, stagger: 0.08, duration: 0.5 }, '<');

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
    { dependencies: [phase], scope: pageRef, revertOnUpdate: true },
  );

  if (phase === 'none') return null;

  return (
    <div ref={pageRef} className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <Logo />
      </div>
      <main id="main-content" className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="connect-card w-full max-w-md rounded-[2rem] border border-line bg-white p-8 text-center shadow-lift sm:p-10">
          <div className="relative mx-auto mb-6 h-24 w-24">
            {phase === 'success' &&
              Array.from({ length: 12 }, (_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={`burst-dot invisible absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full opacity-0 ${BURST_COLORS[i % BURST_COLORS.length]}`}
                />
              ))}
            {phase === 'claiming' ? (
              <svg key="claiming" viewBox="0 0 96 96" className="h-24 w-24" aria-hidden>
                <circle cx="48" cy="48" r="44" className="fill-lavender-soft" />
                <circle
                  className="status-spinner stroke-lavender-deep"
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="80 172"
                />
              </svg>
            ) : (
              <svg key="result" viewBox="0 0 96 96" className="h-24 w-24" aria-hidden>
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
            )}
          </div>

          <h1 data-enter className="mb-3 text-3xl font-bold tracking-tight">
            {phase === 'claiming'
              ? 'Connecting Google Drive…'
              : error
                ? 'Couldn’t connect Google Drive'
                : 'Google Drive connected!'}
          </h1>
          <p data-enter role={error ? 'alert' : 'status'} className="mb-7 leading-relaxed text-ink-soft">
            {phase === 'claiming' ? 'Finishing your Google Drive connection…' : (message ?? 'Nice! Next, let’s get sorting.')}
          </p>

          <div data-enter className="mb-6 h-2 overflow-hidden rounded-full bg-lavender-soft">
            <div className={`progress-fill h-full origin-left scale-x-0 rounded-full ${error ? 'bg-rose' : 'bg-lavender'}`} />
          </div>

          {phase !== 'claiming' && (
            <div data-enter>
              <ButtonLink to="/onboarding" variant={error ? 'primary' : 'secondary'}>
                {error ? 'Try again' : 'Continue'}
              </ButtonLink>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
