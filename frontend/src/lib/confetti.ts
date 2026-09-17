import { gsap, prefersReducedMotion } from './gsap';

const COLORS = ['#b9a6ff', '#a9c4ff', '#ffe7a0', '#bfe3c8', '#ffd1da'];

/**
 * Bursts pastel confetti from the center of `origin`. Pieces live on <body> so the
 * burst can keep falling after a route change; they remove themselves when done.
 */
export function burstConfetti(origin: Element, count = 36): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();

  const rect = origin.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden';
  document.body.appendChild(layer);

  const pieces = Array.from({ length: count }, (_, i) => {
    const piece = document.createElement('span');
    const size = gsap.utils.random(6, 12);
    piece.style.cssText = `position:absolute;left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;width:${size}px;height:${size * gsap.utils.random(0.5, 1.4)}px;border-radius:${i % 3 === 0 ? '999px' : '3px'};background:${COLORS[i % COLORS.length]}`;
    layer.appendChild(piece);
    return piece;
  });

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => {
        layer.remove();
      },
    });
    pieces.forEach((piece) => {
      const angle = gsap.utils.random(0, Math.PI * 2);
      const distance = gsap.utils.random(80, 260);
      tl.to(
        piece,
        {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance - 60,
          rotation: gsap.utils.random(-360, 360),
          duration: gsap.utils.random(0.5, 0.8),
          ease: 'power3.out',
        },
        0,
      ).to(
        piece,
        {
          y: `+=${gsap.utils.random(200, 380)}`,
          autoAlpha: 0,
          rotation: `+=${gsap.utils.random(-180, 180)}`,
          duration: gsap.utils.random(1, 1.6),
          ease: 'power1.in',
        },
        '>-0.1',
      );
    });
    // A real timer, not gsap.delayedCall: callers navigate on resolve, and rAF pauses in background tabs.
    setTimeout(resolve, 550);
  });
}
