import { useRef } from 'react';
import { gsap, useGSAP, MOTION_OK, REDUCED_MOTION, prefersReducedMotion } from '../../lib/gsap';

interface ProgressBarProps {
  /** 0–1, or null while the total isn't known (a sweeping bar). */
  progress: number | null;
  label: string;
  tone?: 'lavender' | 'butter' | 'rose' | 'sage';
  size?: 'sm' | 'md';
  className?: string;
}

const TONES = {
  lavender: 'from-lavender to-periwinkle',
  butter: 'from-butter to-[#ffd36e]',
  rose: 'from-rose to-[#ff9fb2]',
  sage: 'from-sage to-[#8fd0a2]',
};

export function ProgressBar({ progress, label, tone = 'lavender', size = 'md', className = '' }: ProgressBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const indeterminate = progress === null;

  // Determinate: glide to the new fraction.
  useGSAP(
    () => {
      const fill = ref.current?.querySelector('.progress-fill');
      if (!fill || progress === null) return;
      gsap.to(fill, {
        scaleX: progress <= 0 ? 0 : Math.max(Math.min(progress, 1), 0.03),
        xPercent: 0,
        duration: prefersReducedMotion() ? 0 : 0.7,
        ease: 'power2.out',
        overwrite: true,
      });
    },
    { dependencies: [progress], scope: ref },
  );

  // Indeterminate: a sweeping bar.
  useGSAP(
    () => {
      const fill = ref.current?.querySelector('.progress-fill');
      if (!fill || !indeterminate) return;
      const mm = gsap.matchMedia();
      mm.add(REDUCED_MOTION, () => {
        gsap.set(fill, { scaleX: 1, xPercent: 0 });
      });
      mm.add(MOTION_OK, () => {
        gsap.fromTo(fill, { scaleX: 0.35, xPercent: -40 }, { xPercent: 290, duration: 1.3, ease: 'sine.inOut', repeat: -1 });
      });
      return () => mm.revert();
    },
    { dependencies: [indeterminate], scope: ref, revertOnUpdate: true },
  );

  return (
    <div
      ref={ref}
      className={`${size === 'sm' ? 'h-2' : 'h-3'} overflow-hidden rounded-full bg-lavender-soft ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress === null ? undefined : Math.round(Math.min(progress, 1) * 100)}
    >
      {/* No Tailwind scale class here: Tailwind 4's `scale` property would multiply with GSAP's transform. */}
      <div className={`progress-fill h-full w-full origin-left rounded-full bg-gradient-to-r ${TONES[tone]}`} />
    </div>
  );
}
