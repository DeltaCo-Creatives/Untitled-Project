import type { RefObject } from 'react';
import { gsap, useGSAP, ScrollTrigger, MOTION_OK } from '../lib/gsap';

/** Fades and lifts every `[data-reveal]` element inside `scope` as it scrolls into view. */
export function useReveal(scope: RefObject<HTMLElement | null>, dependencies: unknown[] = []) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const items = gsap.utils.toArray<HTMLElement>('[data-reveal]', scope.current);
        if (items.length === 0) return;
        gsap.set(items, { autoAlpha: 0, y: 36 });
        ScrollTrigger.batch(items, {
          start: 'top 90%',
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              autoAlpha: 1,
              y: 0,
              duration: 0.8,
              stagger: 0.1,
              ease: 'back.out(1.4)',
              overwrite: true,
            }),
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies, revertOnUpdate: true },
  );
}
