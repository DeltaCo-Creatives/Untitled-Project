import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { gsap, useGSAP, MOTION_OK } from '../lib/gsap';

const STORAGE_KEY = 'drivetag-beta-banner-v1';

// localStorage can throw (private mode, blocked site data) — a failed read just means "not dismissed yet",
// and a failed write means it reappears next visit, which is a fine fallback either way.
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Best-effort only.
  }
}

/**
 * Slim, dismissible notice while DriveTag is in closed beta. Rendered on Landing only, in normal document
 * flow (never `fixed`) so it can't cover or shift the skip link, which is positioned independently.
 */
export function BetaBanner() {
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (dismissed || !rootRef.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(rootRef.current, { y: -16, autoAlpha: 0, duration: 0.4 });
      });
      return () => mm.revert();
    },
    { dependencies: [dismissed], scope: rootRef, revertOnUpdate: true },
  );

  if (dismissed) return null;

  return (
    <div ref={rootRef} className="relative border-b border-line bg-lavender-soft px-4 py-2.5 text-center">
      <p className="mx-auto max-w-2xl pr-8 text-sm font-semibold text-ink">
        DriveTag is in closed beta while Google reviews it.{' '}
        <Link
          to="/beta"
          className="inline-flex items-center gap-1 font-bold text-ink underline underline-offset-2 hover:text-ink/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
        >
          Request access
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </p>
      <button
        type="button"
        onClick={() => {
          persistDismissed();
          setDismissed(true);
        }}
        aria-label="Dismiss beta notice"
        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-soft hover:bg-white/60 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
