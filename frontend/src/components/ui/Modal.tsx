import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';

type Size = 'md' | 'lg' | 'xl';

const SIZES: Record<Size, string> = {
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-3xl',
};

interface ModalProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  /** While busy, Escape, the backdrop and the close button don't close it. */
  busy?: boolean;
  size?: Size;
  children?: ReactNode;
  /** Pinned below the scrollable body, e.g. action buttons. */
  footer?: ReactNode;
  /** Focused on open; defaults to the first focusable element in the panel. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  title,
  description,
  onClose,
  busy = false,
  size = 'md',
  children,
  footer,
  initialFocusRef,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Latest values for the long-lived key handler without re-running the open effect.
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const target = initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      // Keep focus inside the dialog.
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null && el.tabIndex >= 0,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      // Focus can rest on something that isn't in the list (FolderBrowser's tabIndex -1 scroller), so find the
      // neighbour by document position rather than by identity. The browser moves to it; wrap only past the ends.
      const active = document.activeElement;
      const inside = active !== null && panel.contains(active);
      const hasNeighbour =
        inside &&
        focusable.some(
          (el) =>
            el !== active &&
            el.compareDocumentPosition(active) &
              (event.shiftKey ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING),
        );
      if (!hasNeighbour) {
        event.preventDefault();
        (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, initialFocusRef]);

  useGSAP(
    () => {
      if (!open || !ref.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        // opacity, not autoAlpha: autoAlpha's visibility:hidden would make the initial focus() in the effect below a no-op.
        gsap.from('.dialog-backdrop', { opacity: 0, duration: 0.25, ease: 'power1.out' });
        gsap.from('.dialog-panel', { scale: 0.9, y: 24, opacity: 0, duration: 0.45, ease: 'back.out(1.7)' });
      });
      return () => mm.revert();
    },
    { dependencies: [open], scope: ref, revertOnUpdate: true },
  );

  if (!open) return null;

  return (
    <div ref={ref} className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <div className="dialog-backdrop absolute inset-0 bg-ink/25 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`dialog-panel relative flex max-h-[92vh] w-full ${SIZES[size]} flex-col rounded-[2rem] border border-line bg-white shadow-lift focus:outline-none`}
      >
        <div className="flex items-start gap-3 px-6 pb-2 pt-6 sm:px-7">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-2xl font-bold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-ink-soft">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-2 -mt-1 rounded-xl p-2 text-ink-soft transition-colors hover:bg-lavender-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children !== undefined && <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-2 sm:px-7">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end sm:px-7">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
