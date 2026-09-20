import { useId, useState } from 'react';
import { ArrowRight, BadgeCheck, Building, Check, Clock3, Palette, PiggyBank, RefreshCw, Sparkles, Sprout, Users, type LucideIcon } from 'lucide-react';
import { api, type PlanInfo, type PlanTier } from '../../lib/api';
import { plural } from '../../lib/format';
import { errorMessage } from '../../lib/messages';
import { openCheckout, rememberPendingCheckout } from '../../lib/lemonSqueezy';
import { Button, ButtonLink } from '../ui/Button';
import { PAYMENTS_PENDING_NOTE, formatPrice, isFreePlan, monthsFree, planFeatures } from './planFeatures';
import type { BetaPricing } from './PlanGrid';

// Keyed by tier, not plan id: every family's Creator/Studio/Enterprise tier gets the same accent.
const ACCENTS: Record<PlanTier, { icon: LucideIcon; bubble: string; check: string }> = {
  free: { icon: Sprout, bubble: 'bg-sage', check: 'bg-sage' },
  creator: { icon: Palette, bubble: 'bg-periwinkle', check: 'bg-periwinkle-soft' },
  studio: { icon: Users, bubble: 'bg-lavender', check: 'bg-lavender-soft' },
  enterprise: { icon: Building, bubble: 'bg-butter', check: 'bg-butter-soft' },
};

interface PlanCardProps {
  plan: PlanInfo;
  currency: string;
  /** false while no payment provider is integrated: purchase buttons show "Coming soon" instead. */
  current?: boolean;
  signedIn?: boolean;
  compact?: boolean;
  /** For an Images + Documents plan: "Save $2.99/month vs buying both", only when the saving is real. */
  savingsNote?: string | null;
  /** Prices are tax-exclusive unless GET /api/plans says otherwise — drives the "Excludes VAT/sales tax" line. */
  pricesIncludeTax?: boolean;
  /** A signed-in beta tester's discount. Renders the card exactly as today when null. */
  beta?: BetaPricing | null;
}

export function PlanCard({
  plan,
  currency,
  current = false,
  signedIn = false,
  compact = false,
  savingsNote = null,
  pricesIncludeTax = false,
  beta = null,
}: PlanCardProps) {
  const titleId = useId();
  const accent = ACCENTS[plan.tier] ?? ACCENTS.creator;
  const Icon = accent.icon;
  const free = isFreePlan(plan);
  const featured = plan.popular;
  const features = planFeatures(plan, { compact });
  const yearly = plan.price.yearly;
  const freeMonths = !free && yearly != null ? monthsFree(plan.price.monthly, yearly) : 0;
  const showBeta = !free && Boolean(beta) && plan.price.monthly > 0;
  const betaMonthly = showBeta && beta ? Math.round(plan.price.monthly * (100 - beta.percent)) / 100 : null;

  const canBuy = !free && plan.purchasable;
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  // No billing toggle exists on this card today (only the monthly price has a button), so checkout is always
  // opened for the monthly variant — matches the price the button sits under.
  const buy = async () => {
    if (buying) return;
    setBuyError(null);
    setBuying(true);
    try {
      const { url } = await api.createCheckout({ item: plan.id, billing: 'monthly' });
      // Recorded before we hand over to Lemon Squeezy: /checkout/success confirms by matching this,
      // which works even when the webhook lands before the buyer's browser comes back.
      rememberPendingCheckout(plan.id);
      await openCheckout(url);
    } catch (err) {
      setBuyError(errorMessage(err, 'Couldn’t start checkout. Please try again.'));
    } finally {
      setBuying(false);
    }
  };

  return (
    <article
      aria-labelledby={titleId}
      className={`relative flex h-full flex-col rounded-[2rem] border bg-white shadow-soft transition-shadow duration-300 hover:shadow-lift ${
        compact ? 'p-6' : 'p-6 sm:p-7'
      } ${featured ? 'border-lavender' : 'border-line'} ${current ? 'ring-4 ring-sage/70' : ''}`}
    >
      {featured && (
        <span className="plan-ribbon absolute inset-x-0 -top-3.5 mx-auto inline-flex w-fit items-center gap-1 rounded-full bg-gradient-to-r from-lavender to-periwinkle px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-ink shadow-soft">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Recommended
        </span>
      )}

      <div className="mb-4 flex items-start justify-between gap-3">
        <span className={`plan-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${accent.bubble} shadow-soft`}>
          <Icon className="h-6 w-6 text-ink" aria-hidden />
        </span>
        {current && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sage-soft px-2.5 py-1 text-xs font-extrabold text-sage-deep">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            Your plan
          </span>
        )}
      </div>

      <h3 id={titleId} className="text-2xl font-semibold tracking-tight">
        {plan.label}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{plan.tagline}</p>

      <div className={`border-b border-dashed border-line ${compact ? 'my-4 pb-4' : 'my-5 pb-5'}`}>
        {free ? (
          <>
            <p className="font-display text-4xl font-bold tracking-tight text-ink">
              <span aria-hidden>{formatPrice(0, currency)}</span>
              <span className="sr-only">Free</span>
            </p>
            <p className="plan-billing mt-1.5 text-xs font-bold text-ink-soft">Free forever · no credit card</p>
          </>
        ) : (
          <>
            <p className="font-display text-4xl font-bold tracking-tight text-ink">
              {showBeta && betaMonthly != null ? (
                <>
                  <s aria-hidden className="mr-2 align-middle text-xl font-bold text-ink-soft decoration-2">
                    {formatPrice(plan.price.monthly, currency)}
                  </s>
                  <span className="sr-only">Regular price {formatPrice(plan.price.monthly, currency)} per month. Beta price</span>
                  <span aria-hidden>{formatPrice(betaMonthly, currency)}</span>
                  <span aria-hidden className="text-lg font-bold text-ink-soft">
                    /month
                  </span>
                  <span className="sr-only">{formatPrice(betaMonthly, currency)} per month</span>
                </>
              ) : (
                <>
                  <span aria-hidden>{formatPrice(plan.price.monthly, currency)}</span>
                  <span aria-hidden className="text-lg font-bold text-ink-soft">
                    /month
                  </span>
                  <span className="sr-only">{formatPrice(plan.price.monthly, currency)} per month</span>
                </>
              )}
            </p>
            {yearly != null && (
              <p className="plan-billing mt-1.5 text-xs font-bold text-ink-soft">
                or {formatPrice(yearly, currency)}/year{freeMonths >= 1 ? ` — ${plural(freeMonths, 'month', 'months')} free` : ''}
              </p>
            )}
            {!pricesIncludeTax && <p className="mt-1 text-[11px] font-bold text-ink-soft">Excludes VAT/sales tax</p>}
          </>
        )}
        {savingsNote && (
          <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-xs font-bold text-sage-deep">
            <PiggyBank className="h-3.5 w-3.5" aria-hidden />
            {savingsNote}
          </p>
        )}
      </div>

      <ul className={`space-y-2.5 ${compact ? 'mb-5' : 'mb-7'}`}>
        {features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-sm font-semibold leading-snug">
            <span className={`plan-check mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${accent.check}`}>
              <Check className="h-3 w-3 text-ink" strokeWidth={3} aria-hidden />
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        {free ? (
          <ButtonLink to={signedIn ? '/dashboard' : '/login'} className="w-full">
            {signedIn ? 'Go to dashboard' : 'Get started free'}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        ) : canBuy && !signedIn ? (
          // The server can't attribute a purchase without a user id, so a signed-out visitor goes to sign in first.
          <ButtonLink to="/login" variant={featured ? 'primary' : 'secondary'} className="w-full">
            Sign in to subscribe
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        ) : canBuy ? (
          <Button
            variant={featured ? 'primary' : 'secondary'}
            className="w-full"
            onClick={buy}
            disabled={buying}
            aria-label={`Choose ${plan.label}`}
          >
            {buying ? (
              <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
            {buying ? 'Starting checkout…' : 'Choose plan'}
          </Button>
        ) : (
          // No payment provider yet, or this plan has no variant configured: prices are shown, purchasing isn't.
          // The wrapper carries the tooltip too, since some browsers skip titles on disabled buttons.
          <span className="block" title={PAYMENTS_PENDING_NOTE}>
            <Button
              disabled
              variant={featured ? 'primary' : 'secondary'}
              className="w-full"
              title={PAYMENTS_PENDING_NOTE}
              aria-label={`${current ? 'Manage' : 'Choose'} ${plan.label}: coming soon`}
            >
              <Clock3 className="h-4 w-4" aria-hidden />
              Coming soon
            </Button>
          </span>
        )}
      </div>
      {/* Mounted before any error exists, so a screen reader reliably announces the change instead of missing an
          alert that only appears after the fact. Visually collapses (not display:none) while there's nothing to say. */}
      <p aria-live="polite" className={buyError ? 'mt-3 text-sm font-semibold text-rose-ink' : 'sr-only'}>
        {buyError}
      </p>
    </article>
  );
}
