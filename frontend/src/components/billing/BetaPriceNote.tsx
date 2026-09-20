import type { BetaPricing } from './PlanGrid';

interface BetaPriceNoteProps {
  beta: BetaPricing | null;
  className?: string;
}

/** The honest disclosure that goes above a plan grid showing beta pricing. Renders nothing without a discount. */
export function BetaPriceNote({ beta, className = '' }: BetaPriceNoteProps) {
  if (!beta) return null;

  return (
    <p className={`rounded-2xl border border-line bg-lavender-soft/60 p-4 text-sm text-ink ${className}`}>
      <strong>Beta tester pricing</strong> — {beta.percent}% off while you're in the beta. Enter code{' '}
      <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-ink">{beta.code}</code> at
      checkout; Lemon Squeezy applies the discount there, not on the invoice shown before you pay.
    </p>
  );
}
