import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, CircleAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { gsap, useGSAP, MOTION_OK } from '../lib/gsap';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { TagFlowIllustration } from '../components/TagFlowIllustration';

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function Login() {
  useDocumentTitle('Log in');
  const { user, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!pageRef.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap
          .timeline({ defaults: { ease: 'back.out(1.6)' } })
          .from('.login-card', { y: 40, autoAlpha: 0, scale: 0.96, duration: 0.8 })
          .from('.login-card [data-enter]', { y: 18, autoAlpha: 0, stagger: 0.08, duration: 0.5 }, '<0.25')
          .from('.login-art', { x: -40, autoAlpha: 0, duration: 1, ease: 'power3.out' }, 0.1);
      });
      return () => mm.revert();
    },
    { scope: pageRef },
  );

  useGSAP(
    () => {
      if (!error || !pageRef.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo('.login-card', { x: 0 }, { keyframes: { x: [0, -10, 9, -6, 4, 0] }, duration: 0.5, ease: 'power1.out' });
        gsap.from('.login-error', { autoAlpha: 0, y: -8, duration: 0.35 });
      });
      return () => mm.revert();
    },
    { dependencies: [error], scope: pageRef, revertOnUpdate: true },
  );

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSignIn = async () => {
    setError(null);
    setRedirecting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setRedirecting(false);
      setError(err instanceof Error ? err.message : 'Failed to sign in with Google');
    }
  };

  return (
    <div ref={pageRef} className="min-h-screen">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <Link to="/" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
          <ArrowLeft className="h-4 w-4" /> Back home
        </Link>
      </div>

      <main id="main-content" className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 lg:grid-cols-2 lg:pt-12">
        <div className="login-art hidden lg:block">
          <h2 className="mb-2 text-3xl font-bold tracking-tight">Drop. Tag. Sorted.</h2>
          <p className="mb-6 max-w-md text-ink-soft">This is what happens every time an image lands in your Raw folder.</p>
          <TagFlowIllustration />
        </div>

        <div className="login-card mx-auto w-full max-w-md rounded-[2rem] border border-line bg-white p-8 shadow-lift sm:p-10">
          <div data-enter className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-lavender to-periwinkle">
            <ShieldCheck className="h-7 w-7 text-ink" />
          </div>
          <h1 data-enter className="mb-2 text-3xl font-bold tracking-tight">
            Welcome to DriveTag
          </h1>
          <p data-enter className="mb-8 leading-relaxed text-ink-soft">
            Sign in with Google to set up your folders and see everything DriveTag has organized for you.
          </p>

          {error && (
            <div
              role="alert"
              className="login-error mb-4 flex items-start gap-2 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div data-enter>
            <Button variant="secondary" size="lg" className="w-full" onClick={handleSignIn} disabled={redirecting} magnetic>
              <GoogleMark />
              {redirecting ? 'Opening Google…' : 'Continue with Google'}
            </Button>
            <p className="mt-3 text-center text-xs leading-relaxed text-ink-soft">
              By continuing, you agree to our{' '}
              <Link to="/terms" className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
                Terms of Service
              </Link>{' '}
              and acknowledge our{' '}
              <Link to="/privacy" className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          <p data-enter className="mt-6 text-center text-xs leading-relaxed text-ink-soft">
            Zero-Retention: DriveTag processes your images in memory and never stores them.
          </p>
        </div>
      </main>
    </div>
  );
}
