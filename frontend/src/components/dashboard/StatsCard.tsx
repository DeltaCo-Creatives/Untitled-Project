import { useRef } from 'react';
import type { ActivityEntry } from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { plural } from '../../lib/format';
import { AnimatedNumber } from '../ui/AnimatedNumber';

interface StatsCardProps {
  activity: ActivityEntry[];
  className?: string;
}

const STATS: { status: ActivityEntry['status']; label: string; tile: string; bar: string }[] = [
  { status: 'completed', label: 'Organized', tile: 'bg-sage-soft', bar: 'bg-sage' },
  { status: 'processing', label: 'In progress', tile: 'bg-butter-soft', bar: 'bg-butter' },
  { status: 'failed', label: 'Failed', tile: 'bg-rose-soft', bar: 'bg-rose' },
];

/** Organized / in progress / failed counts across the latest activity rows. */
export function StatsCard({ activity, className = '' }: StatsCardProps) {
  const ref = useRef<HTMLElement>(null);

  const counts: Record<ActivityEntry['status'], number> = { completed: 0, processing: 0, failed: 0 };
  for (const entry of activity) counts[entry.status] += 1;

  // The proportion bar grows in from the left once, alongside the card's entrance.
  useGSAP(
    () => {
      const bar = ref.current?.querySelector('.stats-bar');
      if (!bar) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(bar, { scaleX: 0, duration: 1.1, ease: 'power3.out', delay: 0.45 });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      aria-labelledby="stats-heading"
      className={`flex flex-col rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8 ${className}`}
    >
      <h2 id="stats-heading" className="text-2xl font-bold">
        At a glance
      </h2>
      <p className="mb-6 mt-1 text-sm text-ink-soft">
        {activity.length === 0 ? 'Nothing sorted yet' : `From your latest ${plural(activity.length, 'file', 'files')}`}
      </p>
      <dl className="grid flex-1 grid-cols-3 gap-3">
        {STATS.map((stat) => (
          <div key={stat.status} className={`min-w-0 rounded-2xl px-2.5 py-3 sm:p-4 ${stat.tile}`}>
            {/* Three tiles share ~270px on a phone: no letter-spacing there, and break rather than spill out of the tile. */}
            <dt className="text-[0.7rem] font-extrabold uppercase tracking-normal text-ink-soft [overflow-wrap:anywhere] sm:text-xs sm:tracking-wider">
              {stat.label}
            </dt>
            <dd className="font-display text-3xl font-bold">
              <AnimatedNumber value={counts[stat.status]} />
            </dd>
          </div>
        ))}
      </dl>
      <div
        className="stats-bar mt-5 flex h-2.5 origin-left gap-0.5 overflow-hidden rounded-full bg-lavender-soft"
        aria-hidden
      >
        {activity.length > 0 &&
          STATS.map((stat) =>
            counts[stat.status] > 0 ? (
              <span key={stat.status} className={`h-full ${stat.bar}`} style={{ flexGrow: counts[stat.status] }} />
            ) : null,
          )}
      </div>
    </section>
  );
}
