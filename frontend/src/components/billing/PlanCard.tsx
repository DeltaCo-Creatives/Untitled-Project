import { useId } from 'react';
import { ArrowRight, BadgeCheck, Building, Check, Clock3, Palette, PiggyBank, Sparkles, Sprout, Users, type LucideIcon } from 'lucide-react';
import type { PlanInfo, PlanTier } from '../../lib/api';
import { plural } from '../../lib/format';
import { Button, ButtonLink } from '../ui/Button';
import { PAYMENTS_PENDING_NOTE, formatPrice, isFreePlan, monthsFree, planFeatures } from './planFeatures';

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
}

export function PlanCard({ plan, currency, current = false, signedIn = false, compact = false, savingsNote = null }: PlanCardProps) {
  const titleId = useId();
  const accent = ACCENTS[plan.tier] ?? ACCENTS.creator;
  const Icon = accent.icon;
  const free = isFreePlan(plan);
  const featured = plan.popular;
  const features = planFeatures(plan, { compact });
  const yearly = plan.price.yearly;
  const freeMonths = !free && yearly != null ? monthsFree(plan.price.monthly, yearly) : 0;

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
              <span aria-hidden>{formatPrice(plan.price.monthly, currency)}</span>
              <span aria-hidden className="text-lg font-bold text-ink-soft">
                /month
              </span>
              <span className="sr-only">{formatPrice(plan.price.monthly, currency)} per month</span>
            </p>
            {yearly != null && (
              <p className="plan-billing mt-1.5 text-xs font-bold text-ink-soft">
                or {formatPrice(yearly, currency)}/year{freeMonths >= 1 ? ` — ${plural(freeMonths, 'month', 'months')} free` : ''}
              </p>
            )}
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
        ) : (
          // No payment provider yet: prices are shown, purchasing isn't. The wrapper carries the tooltip too, since
          // some browsers skip titles on disabled buttons.
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
    </article>
  );
}
