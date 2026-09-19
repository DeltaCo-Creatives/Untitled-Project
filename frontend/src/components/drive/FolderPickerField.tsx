import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Folder, FolderSearch } from 'lucide-react';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { Modal } from '../ui/Modal';
import { FolderBrowser } from './FolderBrowser';
import type { DisabledFolders, PickedFolder } from './types';

type Tone = 'butter' | 'sage' | 'lavender' | 'periwinkle';

const TONES: Record<Tone, { chip: string; icon: string }> = {
  butter: { chip: 'bg-butter-soft', icon: 'bg-butter' },
  sage: { chip: 'bg-sage-soft', icon: 'bg-sage' },
  lavender: { chip: 'bg-lavender-soft', icon: 'bg-lavender' },
  periwinkle: { chip: 'bg-periwinkle-soft', icon: 'bg-periwinkle' },
};

interface FolderPickerFieldProps {
  label: string;
  value: PickedFolder | null;
  onChange: (folder: PickedFolder) => void;
  hint?: ReactNode;
  error?: string | null;
  disabledFolders?: DisabledFolders;
  startFolderId?: string | null;
  /** Chip tint for the chosen folder. */
  tone?: Tone;
  /** Button text when empty, default "Choose a folder". */
  placeholder?: string;
  /** Default = label. */
  modalTitle?: string;
  disabled?: boolean;
}

/** A labelled form field whose value is a Drive folder, picked in a dialog. */
export function FolderPickerField({
  label,
  value,
  onChange,
  hint,
  error,
  disabledFolders,
  startFolderId,
  tone = 'lavender',
  placeholder = 'Choose a folder',
  modalTitle,
  disabled = false,
}: FolderPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLSpanElement>(null);
  /** The folder the chip last showed, so only a real change pops (not the first render). */
  const shownId = useRef<string | null>(value?.id ?? null);

  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const messageId = `${id}-message`;
  const colors = TONES[tone];

  useGSAP(
    () => {
      const previous = shownId.current;
      const current = value?.id ?? null;
      shownId.current = current;
      if (!current || current === previous || !chipRef.current) return;
      const chip = chipRef.current;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(chip, { scale: 0.5, autoAlpha: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
      });
      return () => mm.revert();
    },
    { dependencies: [value?.id], revertOnUpdate: true },
  );

  const handleSelect = (folder: PickedFolder) => {
    onChange(folder);
    setOpen(false);
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <span id={labelId} className="block text-sm font-bold text-ink">
        {label}
      </span>

      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={error || hint ? messageId : undefined}
        className={`group flex min-h-[3.25rem] w-full min-w-0 items-center gap-3 rounded-2xl border bg-canvas py-2 pl-2 pr-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${
          error
            ? 'border-rose-ink/60 focus-visible:ring-rose/40'
            : 'border-ink-soft/80 hover:border-lavender focus-visible:border-lavender focus-visible:ring-lavender/40'
        }`}
      >
        {value ? (
          <span
            ref={chipRef}
            id={valueId}
            className={`inline-flex min-w-0 max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-sm font-bold text-ink ${colors.chip}`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${colors.icon}`}>
              <Folder aria-hidden className="h-3.5 w-3.5" />
            </span>
            <span className="truncate" title={value.name}>
              {value.name}
            </span>
          </span>
        ) : (
          <span id={valueId} className="flex min-w-0 items-center gap-2 pl-1.5 text-sm font-semibold text-ink-soft">
            <FolderSearch aria-hidden className="h-4 w-4 shrink-0 text-lavender-deep" />
            <span className="truncate">{placeholder}</span>
          </span>
        )}
        <span aria-hidden className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-bold text-ink-soft group-hover:text-ink">
          {value ? 'Change' : 'Browse'}
          <ChevronRight className="h-4 w-4" />
        </span>
      </button>

      {error ? (
        <p id={messageId} role="alert" className="text-xs font-semibold text-rose-ink">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="text-xs leading-relaxed text-ink-soft">
            {hint}
          </p>
        )
      )}

      {/* Portaled so a transformed ancestor (GSAP-animated cards) can't trap the fixed-position dialog. */}
      {createPortal(
        <Modal
          open={open}
          title={modalTitle ?? label}
          description="Open a folder to look inside, or search all of your Drive. Then pick the one you want."
          size="lg"
          onClose={() => setOpen(false)}
        >
          <FolderBrowser
            selectedId={value?.id ?? null}
            onSelect={handleSelect}
            disabledFolders={disabledFolders}
            startFolderId={startFolderId}
          />
        </Modal>,
        document.body,
      )}
    </div>
  );
}
