import { useRef, useState } from 'react';
import type { BillingInterval, PlanId, PlanInfo } from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { SegmentedControl } from '../ui/SegmentedControl';
import { PlanCard } from './PlanCard';
import { FEATURED_PLAN_ID, offersYearly } from './planFeatures';

const INTERVAL_OPTIONS: { value: BillingInterval; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

interface PlanGridProps {
  plans: PlanInfo[];
  currentPlanId?: PlanId | null;
  signedIn?: boolean;
  /** Tighter cards and no billing toggle, for the landing page. */
  compact?: boolean;
}

export function PlanGrid({ plans, currentPlanId = null, signedIn = false, compact = false }: PlanGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [interval, setBillingInterval] = useState<BillingInterval>('monthly');
  const shownInterval = useRef(interval);
  const showToggle = !compact && offersYearly(plans);

  // Cards rise in one after another when the grid scrolls into view, then their checks pop.
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
    { scope: ref },
  );

  // Switching Monthly/Yearly only changes the billing notes; nudge them so the change is seen.
  useGSAP(
    () => {
      if (shownInterval.current === interval) return;
      shownInterval.current = interval;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.plan-billing', { y: 8, autoAlpha: 0, duration: 0.4, stagger: 0.05, ease: 'back.out(2)' });
      });
      return () => mm.revert();
    },
    { dependencies: [interval], scope: ref, revertOnUpdate: true },
  );

  return (
    <div ref={ref}>
      {showToggle && (
        <div className="mb-10 flex flex-col items-center gap-2">
          <SegmentedControl options={INTERVAL_OPTIONS} value={interval} onChange={setBillingInterval} ariaLabel="Billing period" />
          <p className="text-center text-xs font-semibold text-ink-soft">Prices for both options arrive when payments launch.</p>
        </div>
      )}

      <div className={`grid md:grid-cols-2 xl:grid-cols-4 ${compact ? 'gap-5' : 'gap-6'}`}>
        {plans.map((plan) => (
          <div key={plan.id} className="plan-cell">
            <PlanCard
              plan={plan}
              interval={compact ? 'monthly' : interval}
              current={plan.id === currentPlanId}
              featured={plan.id === FEATURED_PLAN_ID}
              signedIn={signedIn}
              compact={compact}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
