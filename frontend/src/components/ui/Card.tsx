import type { HTMLAttributes, PointerEvent } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lifts and tilts toward the pointer on hover. */
  interactive?: boolean;
}

export function Card({ interactive = false, className = '', children, ...rest }: CardProps) {
  const { contextSafe } = useGSAP();

  const onPointerMove = contextSafe((event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || prefersReducedMotion() || event.pointerType !== 'mouse') return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    gsap.to(el, {
      rotationY: px * 8,
      rotationX: -py * 8,
      y: -6,
      transformPerspective: 900,
      duration: 0.4,
      overwrite: 'auto',
    });
  });

  const onPointerLeave = contextSafe((event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || prefersReducedMotion()) return;
    gsap.to(event.currentTarget, {
      rotationX: 0,
      rotationY: 0,
      y: 0,
      duration: 0.8,
      ease: 'elastic.out(1, 0.5)',
      overwrite: 'auto',
    });
  });

  return (
    <div
      className={`rounded-3xl border border-line bg-white shadow-soft ${interactive ? 'transition-shadow will-change-transform hover:shadow-lift' : ''} ${className}`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      {...rest}
    >
      {children}
    </div>
  );
}
