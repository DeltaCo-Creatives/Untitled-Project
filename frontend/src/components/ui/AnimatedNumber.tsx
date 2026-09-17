import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK, REDUCED_MOTION } from '../../lib/gsap';

export function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(REDUCED_MOTION, () => {
        el.textContent = value.toLocaleString();
      });
      mm.add(MOTION_OK, () => {
        const counter = { n: Number(el.textContent?.replace(/\D/g, '')) || 0 };
        gsap.to(counter, {
          n: value,
          duration: 1.4,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = Math.round(counter.n).toLocaleString();
          },
        });
      });
      return () => mm.revert();
    },
    { dependencies: [value], scope: ref, revertOnUpdate: true },
  );

  return (
    <span ref={ref} className={`tabular-nums ${className}`} aria-live="polite">
      0
    </span>
  );
}
