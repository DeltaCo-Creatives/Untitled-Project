import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';

const BLOBS = [
  'bg-lavender/45 w-[30rem] h-[30rem] -top-40 -left-32',
  'bg-periwinkle/40 w-[26rem] h-[26rem] top-[30%] -right-36',
  'bg-butter/55 w-[22rem] h-[22rem] -bottom-24 left-[20%]',
  'bg-sage/45 w-[20rem] h-[20rem] top-[55%] -left-24',
];

/** Slowly drifting pastel blobs behind every page, with a gentle pointer parallax. */
export function BlobBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.utils.toArray<HTMLElement>('.blob', ref.current).forEach((blob, i) => {
          gsap.to(blob, {
            x: 'random(-80, 80)',
            y: 'random(-60, 60)',
            scale: 'random(0.85, 1.2)',
            duration: 'random(8, 13)',
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
            repeatRefresh: true,
            delay: i * 0.5,
          });
        });

        const xTo = gsap.quickTo('.blob-layer', 'x', { duration: 1.6, ease: 'power3.out' });
        const yTo = gsap.quickTo('.blob-layer', 'y', { duration: 1.6, ease: 'power3.out' });
        const onMove = (event: PointerEvent) => {
          xTo((event.clientX / window.innerWidth - 0.5) * 40);
          yTo((event.clientY / window.innerHeight - 0.5) * 40);
        };
        window.addEventListener('pointermove', onMove);
        return () => window.removeEventListener('pointermove', onMove);
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="blob-layer absolute inset-0">
        {BLOBS.map((classes) => (
          <div key={classes} className={`blob absolute rounded-full blur-3xl will-change-transform ${classes}`} />
        ))}
      </div>
    </div>
  );
}
