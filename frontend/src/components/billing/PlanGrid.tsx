import { useRef } from 'react';
import type { PlanId, PlanInfo } from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { PlanCard } from './PlanCard';
import { bundleSavings, plansForFamily, type FamilyChoice } from './planFeatures';

/** A beta tester's discount, resolved from `me.beta` by the caller. Null renders every card at its regular price. */
export interface BetaPricing {
  percent: number;
  code: string;
}

interface PlanGridProps {
  /** The full plan list from GET /api/plans — filtered here to Free plus the selected family's tiers. */
  plans: PlanInfo[];
  family: FamilyChoice;
  currency: string;
  /** false while no payment provider is integrated: purchase buttons show "Coming soon" instead. */
  currentPlanId?: PlanId | null;
  signedIn?: boolean;
  /** Tighter cards, for the landing page. */
  compact?: boolean;
  /** Prices are tax-exclusive unless GET /api/plans says otherwise — drives the "Excludes VAT/sales tax" line. */
  pricesIncludeTax?: boolean;
  /** A signed-in beta tester's discount, or null/undefined for everyone else. */
  beta?: BetaPricing | null;
}

export function PlanGrid({
  plans,
  family,
  currency,
  currentPlanId = null,
  signedIn = false,
  compact = false,
  pricesIncludeTax = false,
  beta = null,
}: PlanGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const visiblePlans = plansForFamily(plans, family);

  // Cards rise in one after another when the grid scrolls into view, then their checks pop. Replays whenever the
  // family switches, since the visible cards change (revertOnUpdate cleans up the previous timeline/ScrollTrigger).
  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const cells = gsap.utils.toArray<HTMLElement>('.plan-cell', root);
        if (cells.length === 0) return;
        // Already on screen: play now instead of waiting for a scroll that may never come.
        const onScreen = root.getBoundingClientRect().top < window.innerHeight;
        // opacity, not autoAlpha: visibility:hidden would keep unrevealed cards out of the tab order and accessibility tree.
        const timeline = gsap
          .timeline(onScreen ? {} : { scrollTrigger: { trigger: root, start: 'top 85%', once: true } })
          .from(cells, { y: 48, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'back.out(1.4)' })
          .from(
            gsap.utils.toArray('.plan-check', root),
            { scale: 0, duration: 0.4, stagger: 0.02, ease: 'back.out(3)' },
            '-=0.55',
          );
        const ribbon = root.querySelector('.plan-ribbon');
        if (ribbon) {
          timeline.from(ribbon, { scale: 0.4, rotation: -12, opacity: 0, duration: 0.6, ease: 'back.out(2.6)' }, '<');
        }
        // Keyboard focus landing on a card that hasn't scrolled in yet shows the grid straight away.
        const onFocusIn = () => {
          if (timeline.progress() === 1) return;
          timeline.scrollTrigger?.kill(false, true);
          timeline.progress(1);
        };
        root.addEventListener('focusin', onFocusIn);
        return () => root.removeEventListener('focusin', onFocusIn);
      });
      return () => mm.revert();
    },
    { dependencies: [family], scope: ref, revertOnUpdate: true },
  );

  return (
    <div ref={ref}>
      <div className={`grid md:grid-cols-2 xl:grid-cols-4 ${compact ? 'gap-5' : 'gap-6'}`}>
        {visiblePlans.map((plan) => (
          <div key={plan.id} className="plan-cell">
            <PlanCard
              plan={plan}
              currency={currency}
              current={plan.id === currentPlanId}
              signedIn={signedIn}
              compact={compact}
              savingsNote={bundleSavings(plans, plan, currency)}
              pricesIncludeTax={pricesIncludeTax}
              beta={beta}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
