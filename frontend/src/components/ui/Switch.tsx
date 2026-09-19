import { useRef } from 'react';
import { Check, LoaderCircle, Pause } from 'lucide-react';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Turn on automatic sorting". */
  label: string;
  disabled?: boolean;
  busy?: boolean;
  size?: 'sm' | 'md';
}

const SIZES = {
  sm: { track: 'h-7 w-12', knob: 'h-5 w-5', icon: 'h-3 w-3', travel: 20 },
  md: { track: 'h-9 w-16', knob: 'h-7 w-7', icon: 'h-3.5 w-3.5', travel: 28 },
};

/** The pastel on/off switch with an elastic knob. */
export function Switch({ checked, onChange, label, disabled = false, busy = false, size = 'md' }: SwitchProps) {
  const knobRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const dims = SIZES[size];

  useGSAP(
    () => {
      if (!knobRef.current) return;
      // Snap on first render, spring on every change after.
      const animate = placed.current && !prefersReducedMotion();
      gsap.to(knobRef.current, {
        x: checked ? dims.travel : 0,
        duration: animate ? 0.7 : 0,
        ease: 'elastic.out(1, 0.55)',
        overwrite: 'auto',
      });
      placed.current = true;
    },
    { dependencies: [checked, dims.travel] },
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      // Busy stays focusable (aria-disabled, clicks ignored): a native disabled would drop keyboard focus to <body>.
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) onChange(!checked);
      }}
      disabled={disabled}
      className={`relative ${dims.track} shrink-0 rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:cursor-not-allowed aria-disabled:cursor-wait ${busy ? '' : 'disabled:opacity-60'} ${checked ? 'bg-sage' : 'bg-line'}`}
    >
      <span
        ref={knobRef}
        className={`absolute left-1 top-1 flex ${dims.knob} items-center justify-center rounded-full bg-white shadow-soft`}
      >
        {busy ? (
          <LoaderCircle className={`${dims.icon} animate-spin motion-reduce:animate-none`} />
        ) : checked ? (
          <Check className={dims.icon} strokeWidth={3} />
        ) : (
          <Pause className={dims.icon} />
        )}
      </span>
    </button>
  );
}
