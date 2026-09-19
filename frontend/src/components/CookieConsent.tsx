import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './ui/Button';
import { gsap, useGSAP, MOTION_OK } from '../lib/gsap';
import {
  OPEN_COOKIE_SETTINGS_EVENT,
  getAnalyticsConsent,
  setAnalyticsConsent,
  type ConsentChoice,
} from '../lib/consent';

const CURRENT_CHOICE_LABEL: Record<ConsentChoice, string> = {
  granted: 'Currently: analytics allowed.',
  denied: 'Currently: analytics declined.',
};

/**
 * Bottom, non-blocking cookie banner. Shown once on first visit (before any choice is stored) and again
 * whenever the footer's "Cookie settings" fires OPEN_COOKIE_SETTINGS_EVENT. Never a dark pattern: both
 * choices are equal-weight buttons, nothing is pre-ticked, and a stored choice is never re-asked for.
 */
export function CookieConsent() {
  const [stored, setStored] = useState<ConsentChoice | null>(() => getAnalyticsConsent());
  const [open, setOpen] = useState(stored === null);
  const [reopened, setReopened] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const headingId = useId();

  useEffect(() => {
    const onOpen = () => {
      triggerRef.current = document.activeElement as HTMLElement | null;
      setReopened(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
  }, []);

  // Only steal focus when explicitly reopened from settings — never on the unprompted first view.
  useEffect(() => {
    if (open && reopened) headingRef.current?.focus();
  }, [open, reopened]);

  function choose(choice: ConsentChoice) {
    setAnalyticsConsent(choice);
    setStored(choice);
    setOpen(false);
    if (reopened) triggerRef.current?.focus?.();
    setReopened(false);
  }

  // Escape closes the reopened settings without changing anything: a keypress must never silently flip a
  // choice the user already made. The first, unprompted view (no choice yet) doesn't bind it at all.
  useEffect(() => {
    if (!open || !reopened || stored === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      setReopened(false);
      triggerRef.current?.focus?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, reopened, stored]);

  useGSAP(
    () => {
      if (!open || !rootRef.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(rootRef.current, { y: 32, opacity: 0, duration: 0.5, ease: 'power3.out' });
      });
      return () => mm.revert();
    },
    { dependencies: [open], scope: rootRef, revertOnUpdate: true },
  );

  if (!open) return null;

  return (
    <div ref={rootRef} className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
      <div
        role="region"
        aria-labelledby={headingId}
        className="w-full max-w-2xl rounded-[1.75rem] border border-line bg-white p-5 shadow-lift sm:p-6"
      >
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-display text-lg font-bold focus:outline-none">
          Cookie preferences
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          DriveTag only uses what&rsquo;s needed to keep you signed in. With your OK it also counts page visits with
          privacy-friendly analytics — no cookies, no ads, no cross-site tracking.{' '}
          <Link to="/cookies" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
            Cookie Policy
          </Link>
          .
        </p>
        {stored && <p className="mt-2 text-xs text-ink-soft">{CURRENT_CHOICE_LABEL[stored]}</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" size="md" className="sm:flex-1" onClick={() => choose('granted')}>
            Allow analytics
          </Button>
          <Button variant="secondary" size="md" className="sm:flex-1" onClick={() => choose('denied')}>
            Only necessary
          </Button>
        </div>
      </div>
    </div>
  );
}
