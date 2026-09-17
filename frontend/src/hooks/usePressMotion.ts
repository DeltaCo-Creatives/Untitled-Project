import type { PointerEvent } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap';

type Disableable = HTMLElement & { disabled?: boolean };

const idle = (el: Disableable) => Boolean(el.disabled) || prefersReducedMotion();

/** Hover lift, press squish, and an optional magnetic pull toward the pointer. */
export function usePressMotion<T extends Disableable>(magnetic = false) {
  const { contextSafe } = useGSAP();

  return {
    onPointerEnter: contextSafe((event: PointerEvent<T>) => {
      const el = event.currentTarget;
      if (idle(el)) return;
      gsap.to(el, { scale: 1.04, duration: 0.25, overwrite: 'auto' });
    }),
    // No disabled check: a button disabled mid-hover (e.g. while saving) must still settle back.
    onPointerLeave: contextSafe((event: PointerEvent<T>) => {
      const el = event.currentTarget;
      if (prefersReducedMotion()) return;
      gsap.to(el, { scale: 1, x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
    }),
    onPointerDown: contextSafe((event: PointerEvent<T>) => {
      const el = event.currentTarget;
      if (idle(el)) return;
      gsap.to(el, { scale: 0.94, duration: 0.12, overwrite: 'auto' });
    }),
    onPointerUp: contextSafe((event: PointerEvent<T>) => {
      const el = event.currentTarget;
      if (idle(el)) return;
      gsap.to(el, { scale: 1.04, duration: 0.5, ease: 'back.out(3)', overwrite: 'auto' });
    }),
    onPointerMove: contextSafe((event: PointerEvent<T>) => {
      const el = event.currentTarget;
      if (!magnetic || idle(el) || event.pointerType !== 'mouse') return;
      const rect = el.getBoundingClientRect();
      gsap.to(el, {
        x: (event.clientX - rect.left - rect.width / 2) * 0.22,
        y: (event.clientY - rect.top - rect.height / 2) * 0.35,
        duration: 0.4,
        overwrite: 'auto',
      });
    }),
  };
}
