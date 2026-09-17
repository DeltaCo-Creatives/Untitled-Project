import { useRef } from 'react';
import { Coffee, FolderCheck, FolderInput, Mountain, Sparkles, UserRound, type LucideIcon } from 'lucide-react';
import { gsap, useGSAP, ScrollTrigger, MOTION_OK, REDUCED_MOTION } from '../lib/gsap';

interface Example {
  before: string;
  after: string;
  tags: [string, string, string];
  icon: LucideIcon;
  tint: string;
}

// Mirrors the backend's real `genre_subject.ext` naming from utils/filename.js.
const EXAMPLES: Example[] = [
  {
    before: 'IMG_4821.jpg',
    after: 'portrait_woman-smiling.jpg',
    tags: ['portrait', 'woman smiling', 'soft light'],
    icon: UserRound,
    tint: 'from-lavender-soft to-periwinkle-soft',
  },
  {
    before: 'DSC_0192.png',
    after: 'product_ceramic-mug.png',
    tags: ['product', 'ceramic mug', 'minimal'],
    icon: Coffee,
    tint: 'from-butter-soft to-rose-soft',
  },
  {
    before: 'final-final (2).jpg',
    after: 'landscape_mountain-lake.jpg',
    tags: ['landscape', 'mountain lake', 'golden hour'],
    icon: Mountain,
    tint: 'from-sage-soft to-periwinkle-soft',
  },
];

const TAG_COLORS = ['bg-lavender-soft', 'bg-butter-soft', 'bg-sage-soft'];

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** A looping demo: a photo drops into Raw, Gemini tags it, and it's renamed into Sorted. */
export function TagFlowIllustration() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = ref.current!;
      const photos = gsap.utils.toArray<HTMLElement>('.photo', root);
      const raw = root.querySelector('.raw-folder')!;
      const sorted = root.querySelector('.sorted-folder')!;
      const badge = root.querySelector('.sorted-badge')!;
      const mm = gsap.matchMedia();

      mm.add(REDUCED_MOTION, () => {
        const q = gsap.utils.selector(photos[0]);
        gsap.set(photos[0], { autoAlpha: 1 });
        gsap.set(q('.old-name'), { autoAlpha: 0 });
        gsap.set([...q('.new-name'), ...q('.tag'), ...q('.sparkle')], { autoAlpha: 1 });
      });

      mm.add(MOTION_OK, () => {
        gsap.from('.flow-path', { drawSVG: 0, duration: 1.6, ease: 'power2.inOut', delay: 0.3 });
        gsap.to([raw, sorted], { y: -8, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.9 });

        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.3, delay: 0.6 });
        photos.forEach((photo) => {
          const q = gsap.utils.selector(photo);
          tl.set(photo, { autoAlpha: 0, x: 0, y: -150, scale: 0.9, rotation: -8 })
            .set(q('.old-name'), { autoAlpha: 1, y: 0 })
            .set(q('.new-name'), { autoAlpha: 0, y: 8 })
            .set(q('.tag'), { autoAlpha: 0, scale: 0.3 })
            .set(q('.sparkle'), { autoAlpha: 0, scale: 0 })
            .set(q('.scan'), { xPercent: 0 })
            .to(photo, { autoAlpha: 1, y: 0, rotation: 0, scale: 1, duration: 0.85, ease: 'back.out(1.7)' })
            .to(raw, { scale: 1.07, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' }, '<0.35')
            .to(q('.scan'), { xPercent: 400, duration: 0.9, ease: 'power1.inOut' }, '+=0.2')
            .to(q('.sparkle'), { autoAlpha: 1, scale: 1, rotation: 180, duration: 0.5, ease: 'back.out(3)' }, '<0.45')
            .to(q('.tag'), { autoAlpha: 1, scale: 1, duration: 0.45, stagger: 0.14, ease: 'back.out(2.6)' }, '>-0.1')
            .to(q('.old-name'), { autoAlpha: 0, y: -8, duration: 0.3 }, '+=0.25')
            .to(q('.new-name'), { autoAlpha: 1, y: 0, duration: 0.35 }, '<0.1')
            .to(
              photo,
              {
                x: () => center(sorted).x - center(photo).x,
                y: () => center(sorted).y - center(photo).y,
                scale: 0.3,
                rotation: 10,
                autoAlpha: 0,
                duration: 0.8,
                ease: 'power2.in',
              },
              '+=1.2',
            )
            .fromTo(badge, { autoAlpha: 0, scale: 0.3, y: 8 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(3)' }, '>-0.15')
            .to(sorted, { scale: 1.08, duration: 0.2, yoyo: true, repeat: 1 }, '<')
            .to(badge, { autoAlpha: 0, duration: 0.3 }, '+=0.6');
        });

        ScrollTrigger.create({
          trigger: root,
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => (self.isActive ? tl.resume() : tl.pause()),
        });
      });

      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Animation: a photo dropped into the Raw folder is tagged by AI, renamed, and moved into the Sorted folder"
      className="relative mx-auto h-[420px] w-full max-w-[460px]"
    >
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 460 420" fill="none" preserveAspectRatio="none">
        <path
          className="flow-path"
          d="M110 96 C 260 60, 150 300, 350 330"
          stroke="#b9a6ff"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>

      <div className="raw-folder absolute left-0 top-4 flex w-44 items-center gap-3 rounded-3xl border border-line bg-white p-3 shadow-soft">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-butter">
          <FolderInput className="h-5 w-5 text-ink" />
        </span>
        <span>
          <span className="block font-display text-sm font-semibold">Raw</span>
          <span className="block text-xs text-ink-soft">Drop images here</span>
        </span>
      </div>

      <div className="sorted-folder absolute bottom-4 right-0 flex w-44 items-center gap-3 rounded-3xl border border-line bg-white p-3 shadow-soft">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sage">
          <FolderCheck className="h-5 w-5 text-ink" />
        </span>
        <span>
          <span className="block font-display text-sm font-semibold">Sorted</span>
          <span className="block text-xs text-ink-soft">Renamed &amp; filed</span>
        </span>
        <span className="sorted-badge invisible absolute -right-2 -top-2 rounded-full bg-lavender px-2 py-0.5 text-xs font-extrabold text-ink opacity-0 shadow-soft">
          +1
        </span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-56 w-52">
          {EXAMPLES.map((example) => (
            <div
              key={example.after}
              className="photo invisible absolute inset-0 rounded-3xl border border-line bg-white p-3 opacity-0 shadow-lift will-change-transform"
            >
              <div className={`relative flex h-28 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${example.tint}`}>
                <example.icon className="h-11 w-11 text-ink/70" strokeWidth={1.6} />
                <div className="scan absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/90 to-transparent" />
                <Sparkles className="sparkle invisible absolute right-2 top-2 h-4 w-4 text-ink opacity-0" />
              </div>
              <div className="relative mt-2 h-5 text-xs font-bold">
                <span className="old-name absolute inset-0 truncate text-ink-soft">{example.before}</span>
                <span className="new-name invisible absolute inset-0 truncate text-ink opacity-0">{example.after}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {example.tags.map((tag, i) => (
                  <span
                    key={tag}
                    className={`tag invisible rounded-full px-2 py-0.5 text-[10px] font-bold text-ink opacity-0 ${TAG_COLORS[i]}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
