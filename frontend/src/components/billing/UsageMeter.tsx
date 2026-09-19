import { useRef } from 'react';
import { CircleAlert, FileText, Images, PackagePlus, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CurrentPlan, Usage } from '../../lib/api';
import { formatCount, formatDate, plural } from '../../lib/format';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { ProgressBar } from '../ui/ProgressBar';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { anyKindExhausted, kindIncluded, kindLimit, kindUsageSummary, type UsageKind } from './planFeatures';

interface UsageMeterProps {
  plan: CurrentPlan;
  usage: Usage;
  /** One line plus the bar per kind, for tight spots like a dashboard header. */
  compact?: boolean;
  className?: string;
}

const KIND_META: Record<UsageKind, { icon: LucideIcon; label: string; words: { one: string; many: string } }> = {
  images: { icon: Images, label: 'Images', words: { one: 'image', many: 'images' } },
  documents: { icon: FileText, label: 'Documents', words: { one: 'document', many: 'documents' } },
};

interface KindRowProps {
  kind: UsageKind;
  plan: CurrentPlan;
  usage: Usage;
  compact: boolean;
}

function KindRow({ kind, plan, usage, compact }: KindRowProps) {
  const meta = KIND_META[kind];
  const kindUsage = usage[kind];
  const free = plan.id === 'free';

  if (!kindIncluded(plan, usage, kind)) {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-ink-soft">
        <meta.icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="font-bold">{meta.label}:</span> Not included in your plan ·{' '}
        <Link
          to={`/plans?family=${kind}`}
          className="font-bold text-ink-soft underline hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
        >
          add a pack or switch plan
        </Link>
      </p>
    );
  }

  const used = free ? kindUsage.freeUsed : kindUsage.periodUsed;
  const limit = kindLimit(plan, usage, kind);
  const fraction = limit > 0 ? Math.min(1, used / limit) : kindUsage.exhausted ? 1 : 0;
  const tone = kindUsage.exhausted ? 'rose' : fraction >= 0.8 ? 'butter' : 'lavender';
  const refills = !free && usage.periodResetsAt ? formatDate(usage.periodResetsAt) : null;

  const unit = free ? `free ${meta.words.many} used` : `${meta.words.many} this period`;
  const sentence = `${meta.label}: ${formatCount(used)} of ${formatCount(limit)} ${unit}${refills ? ` · refills ${refills}` : ''}`;
  const summary = kindUsageSummary(kindUsage, free, meta.words, usage.periodResetsAt);

  return (
    <div>
      <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${compact ? 'mb-1.5' : 'mb-2'}`}>
        <p className="min-w-0 font-bold">
          <span className="sr-only">{sentence}</span>
          <span aria-hidden className="inline-flex items-baseline gap-1.5">
            <meta.icon className={`relative top-0.5 h-3.5 w-3.5 shrink-0 ${compact ? 'text-ink-soft' : 'text-ink-soft'}`} />
            <AnimatedNumber
              value={used}
              className={`font-display ${compact ? 'text-base' : 'text-2xl'} ${kindUsage.exhausted ? 'text-rose-ink' : 'text-ink'}`}
            />
            <span className={compact ? 'text-sm' : ''}>
              of {formatCount(limit)} {unit}
            </span>
            {refills && (
              <span className={`font-semibold text-ink-soft ${compact ? 'text-xs' : 'text-sm'}`}> · refills {refills}</span>
            )}
          </span>
        </p>
        {kindUsage.topupBalance > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-periwinkle-soft px-2.5 py-1 text-xs font-bold text-ink">
            <PackagePlus className="h-3.5 w-3.5" aria-hidden />
            {plural(kindUsage.topupBalance, `pack ${meta.words.one}`, `pack ${meta.words.many}`)} left
          </span>
        )}
      </div>

      <ProgressBar progress={fraction} label={sentence} tone={tone} size={compact ? 'sm' : 'md'} />

      {!compact && (
        <p
          aria-live="polite"
          className={`mt-2 flex items-start gap-1.5 text-sm font-semibold ${kindUsage.exhausted ? 'text-rose-ink' : 'text-ink-soft'}`}
        >
          {kindUsage.exhausted && <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          {summary}
        </p>
      )}
    </div>
  );
}

export function UsageMeter({ plan, usage, compact = false, className = '' }: UsageMeterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const exhausted = anyKindExhausted(plan, usage);

  // Running out is the moment worth noticing: a small nudge across the whole meter.
  useGSAP(
    () => {
      if (!exhausted) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(ref.current, { x: 0 }, { keyframes: { x: [0, -6, 5, -3, 0] }, duration: 0.45, delay: 0.4 });
      });
      return () => mm.revert();
    },
    { dependencies: [exhausted], scope: ref, revertOnUpdate: true },
  );

  return (
    <div ref={ref} className={`space-y-5 ${className}`}>
      <KindRow kind="images" plan={plan} usage={usage} compact={compact} />
      <KindRow kind="documents" plan={plan} usage={usage} compact={compact} />
    </div>
  );
}
