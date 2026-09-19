import { useRef } from 'react';
import { gsap, useGSAP, ScrollTrigger, MOTION_OK, REDUCED_MOTION } from '../lib/gsap';
import { formatCount } from '../lib/format';

// Illustrative only — a document this long costs exactly the same to sort as a 5-page one, which is the point.
const TOTAL_PAGES = 40;
const PAGE_ANGLE_SPREAD = 76;

interface PageCapIllustrationProps {
  /** Pages the AI actually reads from a PDF before it stops — the real, non-hardcoded limit. */
  pagesRead: number;
  /** ...or this many characters of text from a Word file, Google Doc or text file. */
  textChars: number;
}

const pages = Array.from({ length: TOTAL_PAGES }, (_, i) => ({
  angle: -PAGE_ANGLE_SPREAD / 2 + (PAGE_ANGLE_SPREAD * i) / (TOTAL_PAGES - 1),
}));

/** A fanned 40-page document where only the first few pages light up: cost never scales with page count. */
export function PageCapIllustration({ pagesRead, textChars }: PageCapIllustrationProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = ref.current!;
      const leaves = gsap.utils.toArray<SVGRectElement>('.cap-page', root);
      const readLeaves = leaves.slice(0, pagesRead);
      const mm = gsap.matchMedia();

      mm.add(REDUCED_MOTION, () => {
        gsap.set(leaves, { rotation: (i: number) => pages[i].angle, transformOrigin: '50% 100%' });
      });

      mm.add(MOTION_OK, () => {
        gsap.set(leaves, { rotation: 0, transformOrigin: '50% 100%' });
        const tl = gsap.timeline({ delay: 0.2 });
        tl.to(leaves, {
          rotation: (i: number) => pages[i].angle,
          duration: 1,
          ease: 'power2.out',
          stagger: { each: 0.012, from: 'center' },
        }).to(
          readLeaves,
          { y: -8, duration: 0.4, ease: 'power1.inOut', yoyo: true, repeat: -1, repeatDelay: 1.4, stagger: 0.12 },
          '+=0.2',
        );

        ScrollTrigger.create({
          trigger: root,
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => (self.isActive ? tl.resume() : tl.pause()),
        });
      });

      return () => mm.revert();
    },
    { scope: ref, dependencies: [pagesRead], revertOnUpdate: true },
  );

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Illustration: a ${TOTAL_PAGES}-page document fanned out, with only the first ${pagesRead} pages highlighted as read by AI and the rest dimmed and never billed`}
      className="mx-auto max-w-xl"
    >
      <svg viewBox="0 0 460 260" className="mx-auto h-auto w-full max-w-md" aria-hidden>
        {pages.map((_, i) => {
          const read = i < pagesRead;
          return (
            <rect
              key={i}
              className="cap-page"
              x="207"
              y="105"
              width="46"
              height="150"
              rx="5"
              fill={read ? '#a9c4ff' : '#e9e3ff'}
              stroke={read ? '#6b6590' : '#c9c0f2'}
              strokeWidth={read ? 1.5 : 1}
              opacity={read ? 1 : 0.55}
            />
          );
        })}
      </svg>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-periwinkle" aria-hidden /> Read by AI — first {pagesRead} pages
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line" aria-hidden /> Skipped, never billed
        </span>
      </div>
      <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-ink-soft">
        DriveTag reads only the first {pagesRead} pages of a PDF — or about {formatCount(textChars)} characters of
        text from a Word file, Google Doc or text file — never the rest.
      </p>
      <p className="mt-2 text-center font-display text-lg font-semibold">One document = one credit, whatever its length.</p>
    </div>
  );
}
