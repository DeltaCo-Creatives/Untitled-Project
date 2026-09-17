import { useRef } from 'react';
import { CircleAlert, PackagePlus } from 'lucide-react';
import type { CurrentPlan, Usage } from '../../lib/api';
import { formatCount, formatDate, plural } from '../../lib/format';
import { usageSummary } from '../../lib/messages';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { ProgressBar } from '../ui/ProgressBar';
import { AnimatedNumber } from '../ui/AnimatedNumber';

interface UsageMeterProps {
  plan: CurrentPlan;
  usage: Usage;
  /** One line plus the bar, for tight spots like a dashboard header. */
  compact?: boolean;
  className?: string;
}

export function UsageMeter({ plan, usage, compact = false, className = '' }: UsageMeterProps) {
  const ref = useRef<HTMLDivElement>(null);

  const free = plan.id === 'free';
  const used = free ? usage.freeUsed : usage.periodUsed;
  const limit = free ? usage.freeLimit || plan.freeImages : usage.periodLimit || plan.monthlyImages;
  const fraction = limit > 0 ? Math.min(1, used / limit) : usage.exhausted ? 1 : 0;
  const tone = usage.exhausted ? 'rose' : fraction >= 0.8 ? 'butter' : 'lavender';
  const refills = !free && usage.periodResetsAt ? formatDate(usage.periodResetsAt) : null;

  const unit = free ? 'free images used' : 'images this period';
  const sentence = `${formatCount(used)} of ${formatCount(limit)} ${unit}${refills ? ` · refills ${refills}` : ''}`;
  const summary = usageSummary(plan, usage);

  // Running out is the moment worth noticing: a small nudge on the headline.
  useGSAP(
    () => {
      if (!usage.exhausted) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo('.usage-line', { x: 0 }, { keyframes: { x: [0, -6, 5, -3, 0] }, duration: 0.45, delay: 0.4 });
      });
      return () => mm.revert();
    },
    { dependencies: [usage.exhausted], scope: ref, revertOnUpdate: true },
  );

  return (
    <div ref={ref} className={className}>
      <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 ${compact ? 'mb-2' : 'mb-3'}`}>
        <p className="usage-line min-w-0 font-bold">
          <span className="sr-only">{sentence}</span>
          <span aria-hidden>
            <AnimatedNumber
              value={used}
              className={`font-display ${compact ? 'text-base' : 'text-2xl'} ${usage.exhausted ? 'text-rose-ink' : 'text-ink'}`}
            />
            <span className={compact ? 'text-sm' : ''}>
              {' '}
              of {formatCount(limit)} {unit}
            </span>
            {refills && (
              <span className={`font-semibold text-ink-soft ${compact ? 'text-xs' : 'text-sm'}`}> · refills {refills}</span>
            )}
          </span>
        </p>
        {usage.topupBalance > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-periwinkle-soft px-2.5 py-1 text-xs font-bold text-ink">
            <PackagePlus className="h-3.5 w-3.5" aria-hidden />
            {plural(usage.topupBalance, 'pack image', 'pack images')} left
          </span>
        )}
      </div>

      <ProgressBar progress={fraction} label={sentence} tone={tone} size={compact ? 'sm' : 'md'} />

      {!compact && summary && (
        <p
          aria-live="polite"
          className={`mt-3 flex items-start gap-1.5 text-sm font-semibold ${usage.exhausted ? 'text-rose-ink' : 'text-ink-soft'}`}
        >
          {usage.exhausted && <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          {summary}
        </p>
      )}
    </div>
  );
}
