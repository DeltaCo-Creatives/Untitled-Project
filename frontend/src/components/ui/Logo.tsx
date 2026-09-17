import type { PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { Tag } from 'lucide-react';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap';

interface LogoProps {
  to?: string;
  size?: 'sm' | 'md';
}

export function Logo({ to = '/', size = 'md' }: LogoProps) {
  const { contextSafe } = useGSAP();

  const wiggle = contextSafe((event: PointerEvent<HTMLAnchorElement>) => {
    const icon = event.currentTarget.querySelector('.logo-icon');
    if (!icon || prefersReducedMotion()) return;
    gsap.fromTo(
      icon,
      { rotation: -18, scale: 1.1 },
      { rotation: 0, scale: 1, duration: 1, ease: 'elastic.out(1.2, 0.3)', overwrite: 'auto' },
    );
  });

  const box = size === 'sm' ? 'w-8 h-8 rounded-xl' : 'w-10 h-10 rounded-2xl';
  const icon = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const text = size === 'sm' ? 'text-lg' : 'text-xl';

  return (
    <Link
      to={to}
      onPointerEnter={wiggle}
      className="inline-flex items-center gap-2.5 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
    >
      <span className={`logo-icon ${box} inline-flex items-center justify-center bg-gradient-to-br from-lavender to-periwinkle shadow-soft`}>
        <Tag className={`${icon} fill-butter text-ink`} strokeWidth={2.2} />
      </span>
      <span className={`font-display font-semibold tracking-tight text-ink ${text}`}>DriveTag AI</span>
    </Link>
  );
}
