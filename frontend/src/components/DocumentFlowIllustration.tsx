import { useRef } from 'react';
import { FolderCheck, FolderInput, Receipt, Sparkles } from 'lucide-react';
import { gsap, useGSAP, ScrollTrigger, MOTION_OK, REDUCED_MOTION } from '../lib/gsap';

// Mirrors TagFlowIllustration's own helper: this file animates the same drop-in / slide-into-destination motion.
function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const OLD_NAME = 'Scan_0042.pdf';
const NEW_NAME = 'invoice_acme_2026-08-31.pdf';
const TAGS = ['invoice', 'acme', '2026-08-31'];
const TAG_COLORS = ['bg-periwinkle-soft', 'bg-lavender-soft', 'bg-butter-soft'];

interface DocumentFlowIllustrationProps {
  /** How many of the document's first pages the AI actually reads — drives the "read" highlight count. */
  pagesRead?: number;
}

/**
 * A looping demo mirroring TagFlowIllustration: a document drops into Raw, the AI reads its first
 * pages, tags it, and it's renamed into Invoices.
 */
export function DocumentFlowIllustration({ pagesRead = 5 }: DocumentFlowIllustrationProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pageCount = Math.min(Math.max(pagesRead, 1), 6);

  useGSAP(
    () => {
      const root = ref.current!;
      const raw = root.querySelector('.doc-raw-folder')!;
      const sorted = root.querySelector('.doc-sorted-folder')!;
      const badge = root.querySelector('.doc-sorted-badge')!;
      const card = root.querySelector('.doc-card')!;
      const highlights = gsap.utils.toArray<HTMLElement>('.doc-page-highlight', root);
      const mm = gsap.matchMedia();

      mm.add(REDUCED_MOTION, () => {
        gsap.set(card, { autoAlpha: 1 });
        gsap.set('.doc-old-name', { autoAlpha: 0 });
        gsap.set(['.doc-new-name', '.doc-tag', '.doc-sparkle'], { autoAlpha: 1 });
        gsap.set(highlights, { autoAlpha: 1 });
      });

      mm.add(MOTION_OK, () => {
        gsap.from('.doc-flow-path', { drawSVG: 0, duration: 1.6, ease: 'power2.inOut', delay: 0.3 });
        gsap.to([raw, sorted], { y: -8, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.9 });

        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, delay: 0.9 });
        tl.set(card, { autoAlpha: 0, x: 0, y: -150, scale: 0.9, rotation: 6 })
          .set('.doc-old-name', { autoAlpha: 1, y: 0 })
          .set('.doc-new-name', { autoAlpha: 0, y: 8 })
          .set('.doc-tag', { autoAlpha: 0, scale: 0.3 })
          .set('.doc-sparkle', { autoAlpha: 0, scale: 0 })
          .set(highlights, { autoAlpha: 0 })
          .to(card, { autoAlpha: 1, y: 0, rotation: 0, scale: 1, duration: 0.85, ease: 'back.out(1.7)' })
          .to(raw, { scale: 1.07, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' }, '<0.35')
          // "Reading": each page rect lights up in turn, then settles back down — the AI working through the first pages.
          .to(highlights, { autoAlpha: 1, duration: 0.22, stagger: 0.1, ease: 'power1.inOut' }, '+=0.2')
          .to(highlights, { autoAlpha: 0.15, duration: 0.25, stagger: 0.06 }, '+=0.15')
          .to('.doc-sparkle', { autoAlpha: 1, scale: 1, rotation: 180, duration: 0.5, ease: 'back.out(3)' }, '<0.3')
          .to('.doc-tag', { autoAlpha: 1, scale: 1, duration: 0.45, stagger: 0.14, ease: 'back.out(2.6)' }, '>-0.1')
          .to('.doc-old-name', { autoAlpha: 0, y: -8, duration: 0.3 }, '+=0.25')
          .to('.doc-new-name', { autoAlpha: 1, y: 0, duration: 0.35 }, '<0.1')
          .to(
            card,
            {
              x: () => center(sorted).x - center(card).x,
              y: () => center(sorted).y - center(card).y,
              scale: 0.3,
              rotation: -10,
              autoAlpha: 0,
              duration: 0.8,
              ease: 'power2.in',
            },
            '+=1.2',
          )
          .fromTo(
            badge,
            { autoAlpha: 0, scale: 0.3, y: 8 },
            { autoAlpha: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(3)' },
            '>-0.15',
          )
          .to(sorted, { scale: 1.08, duration: 0.2, yoyo: true, repeat: 1 }, '<')
          .to(badge, { autoAlpha: 0, duration: 0.3 }, '+=0.6');

        ScrollTrigger.create({
          trigger: root,
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => (self.isActive ? tl.resume() : tl.pause()),
        });
      });

      return () => mm.revert();
    },
    { scope: ref, dependencies: [pageCount], revertOnUpdate: true },
  );

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Animation: a scanned PDF dropped into the Raw folder has its first ${pagesRead} pages read by AI, is tagged and renamed, and moves into the Invoices folder`}
      className="relative mx-auto h-[420px] w-full max-w-[460px]"
    >
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 460 420" fill="none" preserveAspectRatio="none">
        <path
          className="doc-flow-path"
          d="M110 96 C 260 60, 150 300, 350 330"
          stroke="#a9c4ff"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>

      <div className="doc-raw-folder absolute left-0 top-4 flex w-44 items-center gap-3 rounded-3xl border border-line bg-white p-3 shadow-soft">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-butter">
          <FolderInput className="h-5 w-5 text-ink" />
        </span>
        <span>
          <span className="block font-display text-sm font-semibold">Raw</span>
          <span className="block text-xs text-ink-soft">Drop files here</span>
        </span>
      </div>

      <div className="doc-sorted-folder absolute bottom-4 right-0 flex w-44 items-center gap-3 rounded-3xl border border-line bg-white p-3 shadow-soft">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-periwinkle">
          <FolderCheck className="h-5 w-5 text-ink" />
        </span>
        <span>
          <span className="block font-display text-sm font-semibold">Invoices</span>
          <span className="block text-xs text-ink-soft">Renamed &amp; filed</span>
        </span>
        <span className="doc-sorted-badge invisible absolute -right-2 -top-2 rounded-full bg-periwinkle px-2 py-0.5 text-xs font-extrabold text-ink opacity-0 shadow-soft">
          +1
        </span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="doc-card invisible absolute h-56 w-52 rounded-3xl border border-line bg-white p-3 opacity-0 shadow-lift will-change-transform">
          <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-periwinkle-soft to-lavender-soft">
            <Receipt className="h-11 w-11 text-ink/70" strokeWidth={1.6} />
            <Sparkles className="doc-sparkle invisible absolute right-2 top-2 h-4 w-4 text-ink opacity-0" />
            <div className="absolute inset-x-3 bottom-2.5 flex h-7 items-end gap-[3px]" aria-hidden>
              {Array.from({ length: pageCount }, (_, i) => (
                <span key={i} className="relative h-full flex-1 overflow-hidden rounded-[2px] bg-white/70">
                  <span className="doc-page-highlight invisible absolute inset-0 rounded-[2px] bg-lavender-deep opacity-0" />
                </span>
              ))}
            </div>
          </div>
          <div className="relative mt-2 h-5 text-xs font-bold">
            <span className="doc-old-name absolute inset-0 truncate text-ink-soft">{OLD_NAME}</span>
            <span className="doc-new-name invisible absolute inset-0 truncate text-ink opacity-0">{NEW_NAME}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {TAGS.map((tag, i) => (
              <span
                key={tag}
                className={`doc-tag invisible rounded-full px-2 py-0.5 text-[10px] font-bold text-ink opacity-0 ${TAG_COLORS[i]}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
