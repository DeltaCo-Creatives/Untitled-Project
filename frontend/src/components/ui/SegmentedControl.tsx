import { useRef, type KeyboardEvent } from 'react';
import { Flip, useGSAP, prefersReducedMotion } from '../../lib/gsap';

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; badge?: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** A pill toggle whose white highlight glides between options (Flip). */
export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, className = '' }: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const pillState = useRef<Flip.FlipState | null>(null);

  const select = (next: T) => {
    if (next === value) return;
    const pill = ref.current?.querySelector('[data-segment-pill]');
    if (pill && !prefersReducedMotion()) pillState.current = Flip.getState(pill);
    onChange(next);
  };

  // Radio group keys: arrows move the selection (wrapping), Home/End jump to the ends, and focus follows it.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = index === 0 ? last : index - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(options[nextIndex].value);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
  };

  // Roving tabindex: only the checked option is in the tab order (the first, if none matches).
  const tabStop = Math.max(0, options.findIndex((option) => option.value === value));

  useGSAP(
    () => {
      const pill = ref.current?.querySelector('[data-segment-pill]');
      if (pillState.current && pill) {
        Flip.from(pillState.current, { targets: pill, duration: 0.45, ease: 'power3.inOut' });
      }
      pillState.current = null;
    },
    { dependencies: [value], scope: ref },
  );

  return (
    <div ref={ref} role="radiogroup" aria-label={ariaLabel} className={`inline-flex gap-1 rounded-2xl bg-lavender-soft p-1 ${className}`}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => select(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`relative rounded-xl px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 ${active ? 'text-ink' : 'text-ink-soft hover:text-ink'}`}
          >
            {active && <span data-segment-pill className="absolute inset-0 rounded-xl bg-white shadow-soft" />}
            <span className="relative inline-flex items-center gap-1.5">
              {option.label}
              {option.badge && (
                <span className="rounded-full bg-sage px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-sage-deep">
                  {option.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
