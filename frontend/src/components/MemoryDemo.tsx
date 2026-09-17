import { useRef } from 'react';
import { Dog, Lock } from 'lucide-react';
import { gsap, useGSAP, ScrollTrigger, MOTION_OK, REDUCED_MOTION } from '../lib/gsap';

const COLS = 6;
const ROWS = 4;
const PARTICLE_COLORS = ['bg-lavender', 'bg-periwinkle', 'bg-butter', 'bg-sage', 'bg-rose'];
const STATUSES = ['Tagging in memory…', 'Renamed & moved in your Drive', 'Image discarded — nothing kept'];

/** Shows an image being tagged, then dissolving: the pixels never land anywhere. */
export function MemoryDemo() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = ref.current!;
      const mm = gsap.matchMedia();

      mm.add(REDUCED_MOTION, () => {
        gsap.set(['.memory-photo', '.memory-tag', '.memory-status-0'], { autoAlpha: 1 });
      });

      mm.add(MOTION_OK, () => {
        const particles = gsap.utils.toArray<HTMLElement>('.particle', root);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });

        tl.set('.memory-photo', { autoAlpha: 0, scale: 0.8, rotation: -4 })
          .set('.memory-tag', { autoAlpha: 0, y: 10, scale: 0.6 })
          .set(particles, { autoAlpha: 0, x: 0, y: 0, rotation: 0, scale: 1 })
          .set('.memory-status', { autoAlpha: 0, y: 8 })
          .to('.memory-photo', { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.7, ease: 'back.out(1.8)' })
          .to('.memory-status-0', { autoAlpha: 1, y: 0, duration: 0.35 }, '<0.2')
          .to('.memory-tag', { autoAlpha: 1, y: 0, scale: 1, stagger: 0.15, duration: 0.45, ease: 'back.out(2.4)' }, '+=0.5')
          .to('.memory-status-0', { autoAlpha: 0, y: -8, duration: 0.25 }, '+=0.6')
          .to('.memory-status-1', { autoAlpha: 1, y: 0, duration: 0.35 })
          .to('.memory-status-1', { autoAlpha: 0, y: -8, duration: 0.25 }, '+=1')
          .set(particles, { autoAlpha: 1 })
          .to('.memory-photo', { autoAlpha: 0, scale: 0.92, duration: 0.25 }, '<')
          .to(
            particles,
            {
              x: () => gsap.utils.random(-120, 120),
              y: () => gsap.utils.random(-110, 70),
              rotation: () => gsap.utils.random(-220, 220),
              scale: () => gsap.utils.random(0.2, 0.7),
              autoAlpha: 0,
              duration: 1.2,
              ease: 'power2.out',
              stagger: { each: 0.015, from: 'random' },
            },
            '<',
          )
          .to('.memory-status-2', { autoAlpha: 1, y: 0, duration: 0.35 }, '<0.3')
          .fromTo('.memory-zero', { scale: 1 }, { scale: 1.15, duration: 0.2, yoyo: true, repeat: 1, ease: 'power2.out' }, '<0.4')
          .to('.memory-tag', { autoAlpha: 0, duration: 0.3 }, '+=1.4')
          .to('.memory-status-2', { autoAlpha: 0, duration: 0.3 }, '<');

        tl.pause();
        ScrollTrigger.create({
          trigger: root,
          start: 'top 85%',
          end: 'bottom top',
          onToggle: (self) => (self.isActive ? tl.resume() : tl.pause()),
        });
      });

      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="rounded-3xl border border-line bg-white p-6 shadow-lift sm:p-8">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-ink-soft">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lavender opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lavender-deep" />
          </span>
          DriveTag worker
        </span>
        <span className="rounded-full bg-lavender-soft px-3 py-1 text-xs font-bold">RAM only</span>
      </div>

      <div className="relative mt-6 flex h-56 flex-col items-center justify-center" aria-hidden>
        <div className="relative h-32 w-40">
          <div className="memory-photo invisible absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-butter-soft to-periwinkle-soft opacity-0">
            <Dog className="h-12 w-12 text-ink/70" strokeWidth={1.6} />
          </div>
          {Array.from({ length: COLS * ROWS }, (_, i) => (
            <span
              key={i}
              className={`particle invisible absolute h-2.5 w-2.5 rounded-[3px] opacity-0 ${PARTICLE_COLORS[i % PARTICLE_COLORS.length]}`}
              style={{
                left: `${((i % COLS) + 0.5) * (100 / COLS)}%`,
                top: `${(Math.floor(i / COLS) + 0.5) * (100 / ROWS)}%`,
              }}
            />
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <span className="memory-tag invisible rounded-full bg-lavender-soft px-3 py-1 text-xs font-bold opacity-0">pet</span>
          <span className="memory-tag invisible rounded-full bg-butter-soft px-3 py-1 text-xs font-bold opacity-0">golden retriever</span>
          <span className="memory-tag invisible rounded-full bg-sage-soft px-3 py-1 text-xs font-bold opacity-0">beach</span>
        </div>
        <div className="relative mt-4 h-5 w-full text-center text-sm font-bold">
          {STATUSES.map((status, i) => (
            <span key={status} className={`memory-status memory-status-${i} invisible absolute inset-0 opacity-0`}>
              {status}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-5 text-sm">
        <div>
          <p className="text-ink-soft">What we keep</p>
          <p className="font-bold">Filename, tags, status</p>
        </div>
        <div>
          <p className="text-ink-soft">Image bytes stored</p>
          <p className="inline-flex items-center gap-1.5 font-bold">
            <Lock className="h-4 w-4 text-sage-deep" />
            <span className="memory-zero inline-block">0 bytes</span>
          </p>
        </div>
      </div>
    </div>
  );
}
