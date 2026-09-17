import type { RefObject } from 'react';
import { gsap, useGSAP, ScrollTrigger, MOTION_OK } from '../lib/gsap';

/** Fades and lifts every `[data-reveal]` element inside `scope` as it scrolls into view. */
export function useReveal(scope: RefObject<HTMLElement | null>, dependencies: unknown[] = []) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const root = scope.current;
        if (!root) return;
        const items = gsap.utils.toArray<HTMLElement>('[data-reveal]', root);
        if (items.length === 0) return;
        const reveal = (targets: Element[]) =>
          gsap.to(targets, { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'back.out(1.4)', overwrite: true });

        // Measured before the lift below shifts them. Anything already on screen comes in now rather than
        // waiting for a scroll that may never come.
        const onScreen = items.filter((item) => item.getBoundingClientRect().top < window.innerHeight);
        const pending = new Set(items.filter((item) => !onScreen.includes(item)));
        // opacity, not autoAlpha: visibility:hidden would keep unrevealed content out of the tab order and accessibility tree.
        gsap.set(items, { opacity: 0, y: 36 });
        if (onScreen.length > 0) reveal(onScreen);
        if (pending.size === 0) return;

        ScrollTrigger.batch([...pending], {
          start: 'top 90%',
          once: true,
          onEnter: (batch) => {
            batch.forEach((item) => pending.delete(item as HTMLElement));
            reveal(batch);
          },
        });

        // Keyboard focus landing inside content that hasn't scrolled in yet shows that content straight away.
        const onFocusIn = (event: FocusEvent) => {
          const target = event.target as Node | null;
          for (const item of pending) {
            if (!item.contains(target)) continue;
            pending.delete(item);
            gsap.set(item, { opacity: 1, y: 0, overwrite: true });
          }
        };
        root.addEventListener('focusin', onFocusIn);
        return () => root.removeEventListener('focusin', onFocusIn);
      });
      return () => mm.revert();
    },
    { scope, dependencies, revertOnUpdate: true },
  );
}
