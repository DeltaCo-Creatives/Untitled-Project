import { Link } from 'react-router-dom';

interface TransparencyNoteProps {
  currency: string;
  /** One or two lines instead of the full note, for tight spots like the landing page. */
  compact?: boolean;
  className?: string;
  /** From GET /api/plans — whether the prices above already include tax. Defaults to today's actual value. */
  pricesIncludeTax?: boolean;
  /** From GET /api/plans. Null (an older API) falls back to generic wording instead of naming a provider. */
  merchantOfRecord?: string | null;
}

/** The no-hidden-fees note required under any price display: tax, auto-renewal, cancellation, overage policy, refunds. */
export function TransparencyNote({
  currency,
  compact = false,
  className = '',
  pricesIncludeTax = false,
  merchantOfRecord = 'Lemon Squeezy',
}: TransparencyNoteProps) {
  const overageNote = compact
    ? 'No overage charges — sorting just pauses until your allowance resets or you add a pack.'
    : 'No overage charges: when an allowance runs out, sorting pauses until it resets or you add a pack.';
  const taxNote = pricesIncludeTax
    ? `Prices are shown in ${currency} and include VAT and sales tax.`
    : merchantOfRecord
      ? `Prices are shown in ${currency} and exclude VAT and sales tax. ${merchantOfRecord}, our Merchant of Record, adds the tax for your country at checkout and shows the total before you pay — the rate depends on where you are.`
      : `Prices are shown in ${currency} and exclude VAT and sales tax, added at checkout and shown before you pay.`;

  return (
    <div className={`mx-auto max-w-2xl text-center text-xs leading-relaxed text-ink-soft ${className}`}>
      <p>
        {taxNote} Plans renew automatically until you cancel — cancel anytime and keep access until the end of your
        paid period.
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
