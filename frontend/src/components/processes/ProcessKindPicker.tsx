import { FileText, Image as ImageIcon, Lock } from 'lucide-react';
import type { ProcessKind } from '../../lib/filename';
import { usePlans } from '../../hooks/usePlans';

interface KindOption {
  value: ProcessKind;
  icon: typeof ImageIcon;
  label: string;
  description: string;
  detail: string;
}

const KIND_OPTIONS: KindOption[] = [
  {
    value: 'image',
    icon: ImageIcon,
    label: 'Images',
    description: 'Photos, logos, graphics and other pictures.',
    detail: 'JPEG, PNG, WebP, GIF, HEIC/HEIF and TIFF.',
  },
  {
    value: 'document',
    icon: FileText,
    label: 'Documents',
    description: 'Paperwork the AI reads and files for you.',
    detail: 'PDF, Word, Google Docs/Sheets/Slides and text files.',
  },
];

interface ProcessKindPickerProps {
  value: ProcessKind | null;
  onChange: (kind: ProcessKind) => void;
  /** Radio group name; must be unique on the page. */
  name: string;
  error?: string | null;
  disabled?: boolean;
}

/** "What will this process sort?" — two large radio cards. Reused by the editor and onboarding. */
export function ProcessKindPicker({ value, onChange, name, error, disabled = false }: ProcessKindPickerProps) {
  // While a release rolls out, the website can go live minutes before the API. An API that predates documents
  // (its plans have no families) would silently save a "document" process as an image process — and a process
  // can never change kind — so Documents waits until the API supports it. Unknown (loading/failed) doesn't block.
  const { plans } = usePlans();
  const documentsReady = !plans || plans.families.length > 0;

  return (
    <fieldset data-field="kind" data-invalid={error ? 'true' : undefined}>
      <legend className="mb-3 text-sm font-bold text-ink">What will this process sort?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {KIND_OPTIONS.map((option) => {
          const checked = value === option.value;
          const unavailable = option.value === 'document' && !documentsReady;
          const optionDisabled = disabled || unavailable;
          return (
            <label
              key={option.value}
              className={`relative flex min-w-0 cursor-pointer items-start gap-3 rounded-3xl border p-4 transition-colors has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-lavender/60 ${
                checked ? 'border-lavender bg-lavender-soft' : 'border-ink-soft/80 bg-white hover:border-lavender'
              } ${optionDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={optionDisabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${checked ? 'bg-lavender' : 'bg-lavender-soft'}`}
              >
                <option.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-ink">{option.label}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink-soft">{option.description}</span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{option.detail}</span>
                {unavailable && (
                  <span className="mt-1.5 block text-xs font-semibold leading-relaxed text-ink">
                    DriveTag is finishing an update. Reload in a few minutes to sort documents.
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-rose-ink">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Read-only stand-in for the picker once a process exists: its kind can't change. */
export function ProcessKindBadge({ kind }: { kind: ProcessKind }) {
  const Icon = kind === 'document' ? FileText : ImageIcon;
  const label = kind === 'document' ? 'Documents' : 'Images';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 rounded-full bg-lavender-soft px-3.5 py-1.5 text-sm font-bold text-ink">
        <Icon className="h-4 w-4" aria-hidden /> {label}
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs leading-relaxed text-ink-soft">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        A process can’t switch kinds — create a new one for the other kind.
      </span>
    </div>
  );
}
