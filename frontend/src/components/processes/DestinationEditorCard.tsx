import { useId, useRef, type ComponentType } from 'react';
import { ArrowDown, ArrowUp, CircleAlert, FolderOpen, FolderPlus, FolderTree, Inbox, Trash } from 'lucide-react';
import type { ProcessLimits } from '../../lib/api';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap';
import { TextArea, TextField } from '../ui/TextField';
import { FolderPickerField } from '../drive/FolderPickerField';
import type { DisabledFolders } from '../drive/types';
import { UNSORTED_NAME, type DestinationDraft } from './processDraft';

interface DestinationEditorCardProps {
  destination: DestinationDraft;
  /** Index in draft.destinations, which server error paths use. */
  index: number;
  /** 1-based position among the regular destinations (unused for Unsorted). */
  number: number;
  errors: Record<string, string>;
  limits: ProcessLimits;
  masterName: string | null;
  masterFolderId: string | null;
  disabledFolders: DisabledFolders;
  disabled?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onChange: (patch: Partial<DestinationDraft>) => void;
  onRemove?: () => void;
  onMove?: (direction: -1 | 1) => void;
}

type FolderMode = DestinationDraft['folderMode'];

interface FolderOptionProps {
  groupName: string;
  value: FolderMode;
  checked: boolean;
  disabled: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  onSelect: (mode: FolderMode) => void;
}

function FolderOption({ groupName, value, checked, disabled, icon: Icon, label, detail, onSelect }: FolderOptionProps) {
  return (
    <label
      className={`relative flex min-w-0 items-start gap-3 rounded-2xl border px-3.5 py-3 text-sm transition-colors has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-lavender/60 ${
        checked ? 'border-lavender bg-lavender-soft' : 'border-ink-soft/80 bg-white hover:border-lavender'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <input
        type="radio"
        name={groupName}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          checked ? 'border-lavender-deep bg-lavender-deep' : 'border-ink-soft/80 bg-white'
        }`}
      >
        {checked && <span data-radio-dot className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-start gap-1.5 font-bold text-ink [overflow-wrap:anywhere]">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          {label}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{detail}</span>
      </span>
    </label>
  );
}

const ICON_BUTTON =
  'rounded-xl p-2 text-ink-soft transition-colors hover:bg-lavender-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';

/** One destination in the process editor: name, description for the AI, and where its folder lives. */
export function DestinationEditorCard({
  destination,
  index,
  number,
  errors,
  limits,
  masterName,
  masterFolderId,
  disabledFolders,
  disabled = false,
  canMoveUp = false,
  canMoveDown = false,
  onChange,
  onRemove,
  onMove,
}: DestinationEditorCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shownMode = useRef(destination.folderMode);
  const groupName = useId();

  const { isFallback, folderMode } = destination;
  const at = `destinations[${index}]`;
  const trimmedName = destination.name.trim();
  const displayName = trimmedName || (isFallback ? UNSORTED_NAME : 'New destination');
  const folderError = errors[`${at}.folder`];
  const generalError = errors[`${at}.id`];
  const master = masterName ? `“${masterName}”` : 'Master';

  // Pop the radio dot when the folder choice changes (not on first render).
  useGSAP(
    () => {
      if (shownMode.current === folderMode) return;
      shownMode.current = folderMode;
      const dot = ref.current?.querySelector('[data-radio-dot]');
      if (!dot || prefersReducedMotion()) return;
      gsap.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.55, ease: 'elastic.out(1.2, 0.5)' });
    },
    { dependencies: [folderMode], scope: ref },
  );

  const options: Omit<FolderOptionProps, 'groupName' | 'checked' | 'disabled' | 'onSelect'>[] = isFallback
    ? [
        {
          value: 'create',
          icon: FolderPlus,
          label: `“${trimmedName || UNSORTED_NAME}” folder in Master`,
          detail: `DriveTag creates it inside ${master}, or reuses one with that name.`,
        },
        {
          value: 'master',
          icon: FolderTree,
          label: 'Master folder itself',
          detail: `Leftovers sit loose in ${master}, next to the sorted folders.`,
        },
        { value: 'existing', icon: FolderOpen, label: 'Pick a folder', detail: 'Any folder in your Drive.' },
      ]
    : [
        {
          value: 'create',
          icon: FolderPlus,
          label: trimmedName ? `Create “${trimmedName}” in Master` : 'Create a matching folder in Master',
          detail: `DriveTag creates it inside ${master}, or reuses one with that name.`,
        },
        { value: 'existing', icon: FolderOpen, label: 'Pick a folder', detail: 'Use a folder you already have.' },
      ];

  return (
    <div
      ref={ref}
      data-flip-card
      data-flip-id={destination.localId}
      data-destination-id={destination.localId}
      data-field={`${at}.id`}
      data-invalid={generalError ? 'true' : undefined}
      className={`rounded-3xl border p-4 sm:p-5 ${isFallback ? 'border-dashed border-butter bg-butter-soft/60' : 'border-line bg-canvas'}`}
    >
      <div className="mb-4 flex items-center gap-3">
        {isFallback ? (
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-butter">
            <Inbox className="h-4 w-4" />
          </span>
        ) : (
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavender font-display text-sm font-bold tabular-nums"
          >
            {number}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className={`truncate text-lg font-semibold ${trimmedName ? 'text-ink' : 'text-ink-soft'}`}>{displayName}</h3>
          {isFallback && <p className="text-xs font-semibold text-ink-soft">For images that fit none of the others</p>}
        </div>
        {!isFallback && (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              data-move="up"
              onClick={() => onMove?.(-1)}
              disabled={disabled || !canMoveUp}
              aria-label={`Move “${displayName}” up`}
              className={ICON_BUTTON}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              data-move="down"
              onClick={() => onMove?.(1)}
              disabled={disabled || !canMoveDown}
              aria-label={`Move “${displayName}” down`}
              className={ICON_BUTTON}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              data-remove
              onClick={onRemove}
              disabled={disabled}
              aria-label={`Remove “${displayName}”`}
              className={`${ICON_BUTTON} hover:bg-rose-soft hover:text-rose-ink`}
            >
              <Trash className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {generalError && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-2xl bg-rose-soft px-3 py-2 text-xs font-semibold text-rose-ink">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          {generalError}
        </p>
      )}

      <div className="space-y-4">
        <div data-field={`${at}.name`} data-invalid={errors[`${at}.name`] ? 'true' : undefined}>
          <TextField
            label="Name"
            value={destination.name}
            onChange={(event) => onChange({ name: event.currentTarget.value })}
            placeholder={isFallback ? UNSORTED_NAME : 'e.g. Logos'}
            maxChars={limits.nameMax}
            error={errors[`${at}.name`]}
            hint={isFallback ? 'This is what {destination} becomes for images that land here.' : undefined}
            disabled={disabled}
            autoComplete="off"
          />
        </div>

        <div data-field={`${at}.description`} data-invalid={errors[`${at}.description`] ? 'true' : undefined}>
          <TextArea
            label={isFallback ? 'Description (optional)' : 'What belongs here'}
            value={destination.description}
            onChange={(event) => onChange({ description: event.currentTarget.value })}
            rows={2}
            placeholder={
              isFallback ? 'e.g. Blurry shots, screenshots and anything unclear' : 'e.g. Brand marks, wordmarks and app icons'
            }
            maxChars={limits.descriptionMax}
            error={errors[`${at}.description`]}
            hint={
              isFallback
                ? 'Most people leave this blank. Add a note if some images should always land here.'
                : 'The AI reads this to decide what belongs here, e.g. brand marks, wordmarks, app icons'
            }
            disabled={disabled}
          />
        </div>

        <fieldset
          data-field={`${at}.folder`}
          data-invalid={folderError ? 'true' : undefined}
          className="min-w-0 space-y-2"
        >
          <legend className="mb-1.5 text-sm font-bold text-ink">
            Folder
          </legend>
          <div className={`grid gap-2 ${isFallback ? 'md:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {options.map((option) => (
              <FolderOption
                key={option.value}
                {...option}
                groupName={groupName}
                checked={folderMode === option.value}
                disabled={disabled}
                onSelect={(mode) => onChange({ folderMode: mode })}
              />
            ))}
          </div>

          {folderMode === 'existing' ? (
            <div className="pt-1">
              <FolderPickerField
                label="Chosen folder"
                modalTitle={`Choose a folder for “${destination.name.trim() || (isFallback ? 'Unsorted' : 'this destination')}”`}
                value={destination.folder}
                onChange={(folder) => onChange({ folder })}
                error={folderError}
                disabledFolders={disabledFolders}
                startFolderId={masterFolderId}
                tone={isFallback ? 'butter' : 'lavender'}
                placeholder="Choose a folder"
                disabled={disabled}
              />
            </div>
          ) : (
            folderError && (
              <p role="alert" className="text-xs font-semibold text-rose-ink">
                {folderError}
              </p>
            )
          )}
        </fieldset>
      </div>
    </div>
  );
}
