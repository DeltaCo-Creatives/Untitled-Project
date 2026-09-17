import { useEffect, useRef, type ReactNode } from 'react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  useGSAP(
    () => {
      if (!open || !ref.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from('.dialog-backdrop', { autoAlpha: 0, duration: 0.25, ease: 'power1.out' });
        gsap.from('.dialog-panel', { scale: 0.88, y: 20, autoAlpha: 0, duration: 0.45, ease: 'back.out(1.8)' });
      });
      return () => mm.revert();
    },
    { dependencies: [open], scope: ref, revertOnUpdate: true },
  );

  if (!open) return null;

  return (
    <div ref={ref} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="dialog-backdrop absolute inset-0 bg-ink/25 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="dialog-panel relative w-full max-w-md rounded-[2rem] border border-line bg-white p-7 shadow-lift"
      >
        <h2 id="confirm-dialog-title" className="mb-2 text-2xl font-bold">
          {title}
        </h2>
        <div className="mb-7 leading-relaxed text-ink-soft">{children}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
