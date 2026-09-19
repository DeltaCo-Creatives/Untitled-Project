import { useRef } from 'react';
import { CircleAlert, Gauge, Gem } from 'lucide-react';
import type { CurrentPlan, Usage } from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { formatCount, plural } from '../../lib/format';
import { usageSummary } from '../../lib/messages';
import { ButtonLink } from '../ui/Button';
import { UsageMeter } from '../billing/UsageMeter';
import { aiWorkersFeature } from '../billing/planFeatures';

interface UsageCardProps {
  plan: CurrentPlan | null;
  usage: Usage | null;
  className?: string;
}

/** The plan badge, how many images are left, and the way to more. */
export function UsageCard({ plan, usage, className = '' }: UsageCardProps) {
  const ref = useRef<HTMLElement>(null);
  const exhausted = Boolean(usage?.exhausted);

  useGSAP(
    () => {
      const note = ref.current?.querySelector('.usage-alert');
      if (!note || !exhausted) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(note, { y: -8, autoAlpha: 0, duration: 0.45, ease: 'back.out(1.8)', delay: 0.4 });
        const icon = ref.current?.querySelector('.usage-icon');
        if (icon) gsap.to(icon, { rotation: -10, duration: 0.5, yoyo: true, repeat: -1, repeatDelay: 1.6, ease: 'sine.inOut' });
      });
      return () => mm.revert();
    },
    { dependencies: [exhausted], scope: ref, revertOnUpdate: true },
  );

  const allowance = plan
    ? plan.id === 'free'
      ? `${formatCount(plan.freeImages)} images, no time limit`
      : `${formatCount(plan.monthlyImages)} images a month`
    : null;

  return (
    <section
      ref={ref}
      aria-labelledby="usage-heading"
      className={`flex flex-col rounded-[2rem] border bg-white p-6 shadow-soft sm:p-8 ${exhausted ? 'border-rose' : 'border-line'} ${className}`}
    >
      <div className="mb-5 flex items-center gap-3">
        <span
          className={`usage-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${exhausted ? 'bg-rose' : 'bg-butter-soft'}`}
          aria-hidden
        >
          <Gauge className={`h-5 w-5 ${exhausted ? 'text-rose-ink' : 'text-ink'}`} />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2 id="usage-heading" className="text-2xl font-bold">
            Your plan
          </h2>
          {plan && <span className="rounded-full bg-lavender px-3 py-0.5 text-xs font-extrabold">{plan.label}</span>}
        </div>
      </div>

      {plan && usage ? (
        <>
          {/* Compact when exhausted: the highlighted note below says it instead. */}
          <UsageMeter plan={plan} usage={usage} compact={exhausted} />
          {exhausted && (
            <div
              role="status"
              className="usage-alert mt-4 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm text-rose-ink"
            >
              <p className="flex items-start gap-2 font-bold">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {usageSummary(plan, usage)}
              </p>
              <p className="mt-1 pl-6">New images wait safely in Raw. “Organize now” sorts them once you have images again.</p>
            </div>
          )}
          <p className="mt-4 text-sm text-ink-soft">
            Includes {plural(plan.maxProcesses, 'work process', 'work processes')} · {aiWorkersFeature(plan)} · {allowance}
          </p>
        </>
      ) : (
        <p className="leading-relaxed text-ink-soft">
          Your plan and image allowance show up here once you’ve saved your first work process.
        </p>
      )}

      <div className="mt-auto pt-6">
        <ButtonLink to="/plans" variant={exhausted ? 'primary' : 'secondary'} size="sm" magnetic={exhausted}>
          <Gem className="h-4 w-4" aria-hidden /> See plans
        </ButtonLink>
      </div>
    </section>
  );
}
