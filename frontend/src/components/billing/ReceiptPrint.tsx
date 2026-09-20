import { useRef, useState } from 'react';
import { Check, Tag } from 'lucide-react';
import { gsap, useGSAP, MOTION_OK, REDUCED_MOTION } from '../../lib/gsap';
import { burstConfetti } from '../../lib/confetti';

export interface ReceiptLine {
  label: string;
  value: string;
}

export interface ReceiptPrintProps {
  /** e.g. "DriveTag AI — Studio". Printed as the receipt's heading. */
  title: string;
  /** Ordered rows: allowance lines, subtotal, the tax note line, etc. */
  lines: ReceiptLine[];
  /** Pre-formatted total, e.g. "$29.99". Never compute or format currency yourself. */
  total: string;
  /** Optional small print under the total. */
  note?: string;
  className?: string;
}

/**
 * The checkout success screen's printed receipt. Every value arrives pre-formatted from the
 * caller (GET /api/me + GET /api/plans) — this component never computes or formats currency.
 *
 * Under REDUCED_MOTION no timeline is built at all: the default (non-JS) styling already is the
 * finished receipt — paper fully visible, stamp placed at rest, total at full size — so there's
 * nothing to "skip to". MOTION_OK sets the hidden starting values itself before animating out of them.
 */
export function ReceiptPrint({ title, lines, total, note, className = '' }: ReceiptPrintProps) {
  const scope = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const hasCelebrated = useRef(false);
  const [canReplay, setCanReplay] = useState(false);

  useGSAP(
    () => {
      const root = scope.current!;
      const slot = root.querySelector<HTMLElement>('.receipt-slot')!;
      const paper = root.querySelector<HTMLElement>('.receipt-paper')!;
      const rows = gsap.utils.toArray<HTMLElement>('.receipt-line', root);
      const totalRow = root.querySelector<HTMLElement>('.receipt-total-row')!;
      const stamp = root.querySelector<HTMLElement>('.receipt-stamp')!;
      const inkSpread = root.querySelector<HTMLElement>('.receipt-ink-spread')!;
      const mm = gsap.matchMedia();

      const fireConfettiOnce = () => {
        if (hasCelebrated.current || !bodyRef.current) return;
        hasCelebrated.current = true;
        void burstConfetti(bodyRef.current, 24);
      };

      // Reduced motion: the finished receipt is the default render (see JSX below) — nothing to build.
      mm.add(REDUCED_MOTION, () => {
        setCanReplay(false);
      });

      mm.add(MOTION_OK, () => {
        setCanReplay(true);

        const tl = gsap.timeline({ paused: true });
        tlRef.current = tl;

        // 1. Slot judder — the machine waking up.
        tl.to(slot, { scaleY: 1.08, duration: 0.12, yoyo: true, repeat: 1 });

        // 2. Feed — constant-speed paper reveal. ease: 'none' on purpose: a printer feeds at a
        // fixed speed, and easing this would read as a slide-in rather than a print.
        tl.fromTo(
          paper,
          { clipPath: 'inset(0 0 100% 0)' },
          { clipPath: 'inset(0 0 0% 0)', duration: 1.1, ease: 'none' },
        );

        // 3. Lines — rows appear as the paper passes them. The 1px x jitter is derived from each
        // row's index (not Math.random()) so the mechanical wobble stays deterministic.
        tl.from(
          rows,
          {
            autoAlpha: 0,
            y: -4,
            x: (i: number) => (i % 2 === 0 ? 1 : -1),
            stagger: 0.08,
          },
          '<0.1',
        );

        // 4. Total — a beat, then it pops in.
        tl.from(totalRow, { scale: 0.94, duration: 0.4, ease: 'back.out(1.7)' }, '+=0.15');

        // 5. Stamp — plus a soft ink-spread underneath, sold as one beat.
        tl.fromTo(
          stamp,
          // rotation is RELATIVE to the resting rotate-[-8deg] the class already applies (Tailwind v4
          // emits a standalone `rotate` property, which composes with GSAP's `transform` rather than
          // being replaced by it). Landing on 0 means the animated and reduced-motion rest states are
          // the same -8deg; landing on -8 would have stacked them into -16deg.
          { scale: 2.2, rotation: -12, autoAlpha: 0 },
          { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.35, ease: 'back.out(1.7)' },
          '+=0.1',
        );
        tl.fromTo(inkSpread, { scale: 0.8, autoAlpha: 0.5 }, { scale: 1.15, autoAlpha: 0, duration: 0.35 }, '<');

        // 6. Tear-off — the whole receipt drops and settles.
        tl.to(bodyRef.current!, { y: 6, duration: 0.6, ease: 'elastic.out(1, 0.5)' }, '+=0.1');

        // 7. One small confetti burst, once — never repeats on "Print again".
        tl.call(fireConfettiOnce);

        tl.play();
      });

      return () => {
        mm.revert();
        tlRef.current = null;
      };
    },
    { scope, revertOnUpdate: true },
  );

  return (
    <div ref={scope} className={`mx-auto w-full max-w-sm ${className}`}>
      <div
        className="receipt-slot relative z-10 mx-auto h-5 w-40 rounded-full bg-periwinkle-soft shadow-soft"
        aria-hidden
      >
        <div className="absolute inset-x-2 top-1.5 h-1.5 rounded-full bg-white/50 shadow-soft" />
      </div>

      <div ref={bodyRef} className="relative -mt-1">
        <div className="receipt-paper relative overflow-hidden rounded-t-2xl bg-white px-5 pb-6 pt-5 shadow-lift">
          <h3 className="receipt-title font-display text-base font-bold text-ink">{title}</h3>

          <dl className="mt-4 space-y-1.5 text-sm">
            {lines.map((line) => (
              <div key={line.label} className="receipt-line flex items-baseline justify-between gap-3">
                <dt className="text-ink-soft">{line.label}</dt>
                <dd className="font-bold tabular-nums text-ink">{line.value}</dd>
              </div>
            ))}

            <div className="receipt-total-row mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <dt className="font-display text-base font-bold text-ink">Total</dt>
              <dd className="receipt-total font-display text-xl font-extrabold tabular-nums text-ink">{total}</dd>
            </div>
          </dl>

          {/* Footer owns the stamp. It used to be absolutely positioned over the whole paper, which put
              it on top of the right-hand value column — a decorative graphic covering the subtotal. The
              stamp now lives in this row's reserved right gutter (pr-24), so it cannot overlap a figure
              however long the values or the note are. */}
          <div className="relative mt-4 min-h-[4.5rem] pr-24">
            <p className="receipt-paid-label inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-xs font-bold text-sage-deep">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Paid
            </p>

            {note && <p className="mt-3 text-xs text-ink-soft">{note}</p>}

            <div
              className="receipt-stamp pointer-events-none absolute -right-1 top-1/2 flex -translate-y-1/2 rotate-[-8deg] flex-col items-center"
              aria-hidden
            >
              <div className="receipt-ink-spread absolute left-1/2 top-1/2 -z-10 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sage-soft" />
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-sage bg-sage-soft">
                <Tag className="h-6 w-6 text-sage-deep" strokeWidth={2.2} />
              </div>
              <span className="mt-0.5 font-display text-xs font-extrabold tracking-widest text-sage-deep">PAID</span>
            </div>
          </div>

          <svg
            aria-hidden
            viewBox="0 0 40 10"
            preserveAspectRatio="none"
            className="absolute inset-x-0 -bottom-px h-3 w-full"
          >
            <path
              d="M0,10 L0,4 L4,8 L8,2 L12,7 L16,1 L20,9 L24,3 L28,8 L32,2 L36,6 L40,4 L40,10 Z"
              className="fill-canvas"
            />
          </svg>
        </div>
      </div>

      {canReplay && (
        <button
          type="button"
          onClick={() => tlRef.current?.restart()}
          aria-label="Play the receipt printing animation again"
          className="mx-auto mt-4 block rounded-2xl px-3 py-1.5 text-xs font-bold text-ink-soft underline decoration-line underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
        >
          Print again
        </button>
      )}
    </div>
  );
}
