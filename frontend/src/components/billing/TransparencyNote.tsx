import { Link } from 'react-router-dom';

interface TransparencyNoteProps {
  currency: string;
  /** One or two lines instead of the full note, for tight spots like the landing page. */
  compact?: boolean;
  className?: string;
}

/** The no-hidden-fees note required under any price display: tax, auto-renewal, cancellation, overage policy, refunds. */
export function TransparencyNote({ currency, compact = false, className = '' }: TransparencyNoteProps) {
  const overageNote = compact
    ? 'No overage charges — sorting just pauses until your allowance resets or you add a pack.'
    : 'No overage charges: when an allowance runs out, sorting pauses until it resets or you add a pack.';

  return (
    <div className={`mx-auto max-w-2xl text-center text-xs leading-relaxed text-ink-soft ${className}`}>
      <p>
        Prices are shown in {currency}. Sales tax or VAT, where it applies, is calculated at checkout and shown before
        you pay. Plans renew automatically until you cancel — cancel anytime and keep access until the end of your paid
        period.
      </p>
      <p className="mt-1">
        {overageNote}{' '}
        <Link to="/refunds" className="font-bold underline hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
          Refund policy
        </Link>
        .
      </p>
    </div>
  );
}
