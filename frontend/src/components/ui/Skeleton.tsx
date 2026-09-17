import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';

export function Skeleton({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo('.shimmer', { xPercent: -100 }, { xPercent: 100, duration: 1.4, ease: 'sine.inOut', repeat: -1 });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <div ref={ref} aria-hidden className={`relative overflow-hidden rounded-2xl bg-lavender-soft ${className}`}>
      <div className="shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent" />
    </div>
  );
}

/** Three bouncing pastel dots for full-page waits. */
export function PageLoader({ label = 'Loading' }: { label?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to('.dot', { y: -14, duration: 0.45, ease: 'power2.out', stagger: { each: 0.12, repeat: -1, yoyo: true } });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <div ref={ref} role="status" aria-label={label} className="min-h-screen flex items-center justify-center gap-3">
      <span className="dot w-4 h-4 rounded-full bg-lavender" />
      <span className="dot w-4 h-4 rounded-full bg-periwinkle" />
      <span className="dot w-4 h-4 rounded-full bg-butter" />
    </div>
  );
}
