import { useEffect, useRef } from 'react';
import { Braces, Plus, Tags, Trash } from 'lucide-react';
import type { ProcessLimits } from '../../lib/api';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import {
  TAG_FIELD_IDEAS,
  TAG_KEY_MAX,
  deriveTagKey,
  newTagFieldDraft,
  normalizeTypedKey,
  type TagFieldDraft,
} from './processDraft';

interface TagFieldsEditorProps {
  fields: TagFieldDraft[];
  onChange: (fields: TagFieldDraft[]) => void;
  errors: Record<string, string>;
  limits: ProcessLimits;
  disabled?: boolean;
}

const ICON_BUTTON =
  'rounded-xl p-2 text-ink-soft transition-colors hover:bg-rose-soft hover:text-rose-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:cursor-not-allowed disabled:opacity-40';

/** Custom tag fields the AI fills in for every image, usable in names as {tag:key}. */
export function TagFieldsEditor({ fields, onChange, errors, limits, disabled = false }: TagFieldsEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const latest = useRef({ fields, onChange });
  const enteringId = useRef<string | null>(null);
  const focusAdd = useRef(false);
  const removing = useRef(new Set<string>());
  /** Row/footer tops before a list change, so everything that moved can glide into place. */
  const tops = useRef<Map<Element, number> | null>(null);

  useEffect(() => {
    latest.current = { fields, onChange };
  });

  const atLimit = fields.length >= limits.maxTagFields;
  const orderKey = fields.map((field) => field.localId).join('|');
  const usedLabels = new Set(fields.map((field) => field.label.trim().toLowerCase()));
  const ideas = TAG_FIELD_IDEAS.filter((idea) => !usedLabels.has(idea.label.toLowerCase()));

  const measure = () => {
    if (!ref.current || prefersReducedMotion()) return;
    const map = new Map<Element, number>();
    ref.current.querySelectorAll('[data-tag-move]').forEach((el) => map.set(el, el.getBoundingClientRect().top));
    tops.current = map;
  };

  const { contextSafe } = useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;

      const before = tops.current;
      tops.current = null;
      if (before) {
        root.querySelectorAll<HTMLElement>('[data-tag-move]').forEach((el) => {
          const top = before.get(el);
          if (top === undefined) return;
          const delta = top - el.getBoundingClientRect().top;
          if (Math.abs(delta) < 1) return;
          gsap.fromTo(el, { y: delta }, { y: 0, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
        });
      }

      const id = enteringId.current;
      enteringId.current = null;
      const row = id ? root.querySelector<HTMLElement>(`[data-tag-id="${id}"]`) : null;
      if (row) {
        row.querySelector('input')?.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        if (!prefersReducedMotion()) {
          // opacity, not autoAlpha: visibility:hidden would blur the label field we just focused.
          gsap.fromTo(row, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.6)' });
        }
      }

      if (focusAdd.current) {
        focusAdd.current = false;
        addRef.current?.focus({ preventScroll: true });
      }
    },
    { dependencies: [orderKey], scope: ref },
  );

  const takenKeys = (exceptId?: string) =>
    fields.filter((field) => field.localId !== exceptId).map((field) => field.key.trim().toLowerCase());

  const update = (localId: string, patch: Partial<TagFieldDraft>) =>
    onChange(fields.map((field) => (field.localId === localId ? { ...field, ...patch } : field)));

  const changeLabel = (field: TagFieldDraft, label: string) => {
    if (field.keyEdited) update(field.localId, { label });
    else update(field.localId, { label, key: deriveTagKey(label, takenKeys(field.localId)) });
  };

  const changeKey = (field: TagFieldDraft, value: string) => {
    const key = normalizeTypedKey(value);
    // Clearing the key hands it back to the label.
    update(field.localId, { key, keyEdited: key !== '' });
  };

  // A key left empty picks the label's key back up, instead of waiting for the next label edit.
  const settleKey = (field: TagFieldDraft) => {
    if (field.key.trim() || !field.label.trim()) return;
    update(field.localId, { key: deriveTagKey(field.label, takenKeys(field.localId)), keyEdited: false });
  };

  const add = (label = '', description = '') => {
    if (atLimit || disabled) return;
    const field = newTagFieldDraft(label, description, takenKeys());
    measure();
    enteringId.current = field.localId;
    onChange([...fields, field]);
  };

  const fadeOut = contextSafe((element: Element, onComplete: () => void) => {
    gsap.to(element, { autoAlpha: 0, x: -18, duration: 0.22, ease: 'power2.in', onComplete });
  });

  const remove = (localId: string) => {
    if (removing.current.has(localId)) return;
    const commit = () => {
      removing.current.delete(localId);
      const { fields: current, onChange: emit } = latest.current;
      if (!current.some((field) => field.localId === localId)) return;
      measure();
      focusAdd.current = true;
      emit(current.filter((field) => field.localId !== localId));
    };
    const row = ref.current?.querySelector(`[data-tag-id="${localId}"]`);
    if (!row || prefersReducedMotion()) {
      commit();
      return;
    }
    removing.current.add(localId);
    fadeOut(row, commit);
  };

  return (
    <div ref={ref} className="space-y-4">
      {errors.tagFields && (
        <p
          role="alert"
          tabIndex={-1}
          data-field="tagFields"
          data-invalid="true"
          className="rounded-2xl bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink focus:outline-none"
        >
          {errors.tagFields}
        </p>
      )}

      {fields.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-line px-5 py-7 text-center">
          <span aria-hidden className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-butter-soft">
            <Tags className="h-5 w-5" />
          </span>
          <p className="font-bold">No tag fields yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
            Tag fields ask the AI for extra details about each image, like Client, Color palette or Orientation. Put
            them in file names with {'{tag:key}'}.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {fields.map((field, index) => {
            const at = `tagFields[${index}]`;
            const key = field.key.trim().toLowerCase();
            const label = field.label.trim();
            return (
              <li
                key={field.localId}
                data-tag-id={field.localId}
                data-tag-move
                className="rounded-3xl border border-line bg-canvas p-4 sm:p-5"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-butter-soft px-3 py-1 font-mono text-xs font-bold text-ink">
                    <Braces aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{`{tag:${key || '…'}}`}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(field.localId)}
                    disabled={disabled}
                    aria-label={`Remove the “${label || 'untitled'}” tag field`}
                    className={`ml-auto ${ICON_BUTTON}`}
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,13rem)]">
                  <div data-field={`${at}.label`} data-invalid={errors[`${at}.label`] ? 'true' : undefined}>
                    <TextField
                      label="Label"
                      value={field.label}
                      onChange={(event) => changeLabel(field, event.currentTarget.value)}
                      placeholder="e.g. Client"
                      maxChars={limits.tagLabelMax}
                      error={errors[`${at}.label`]}
                      disabled={disabled}
                      autoComplete="off"
                    />
                  </div>
                  <div data-field={`${at}.key`} data-invalid={errors[`${at}.key`] ? 'true' : undefined}>
                    <TextField
                      label="Key"
                      value={field.key}
                      onChange={(event) => changeKey(field, event.currentTarget.value)}
                      onBlur={() => settleKey(field)}
                      placeholder="client"
                      maxLength={TAG_KEY_MAX}
                      error={errors[`${at}.key`]}
                      hint={
                        field.keyEdited && !label ? (
                          'Set by you.'
                        ) : field.keyEdited ? (
                          <>
                            Set by you.{' '}
                            <button
                              type="button"
                              onClick={() =>
                                update(field.localId, {
                                  key: deriveTagKey(field.label, takenKeys(field.localId)),
                                  keyEdited: false,
                                })
                              }
                              disabled={disabled}
                              className="rounded font-bold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
                            >
                              Match the label
                            </button>
                          </>
                        ) : (
                          'Follows the label.'
                        )
                      }
                      className="font-mono"
                      spellCheck={false}
                      autoComplete="off"
                      autoCapitalize="none"
                      disabled={disabled}
                    />
                  </div>
                </div>

                <div className="mt-4" data-field={`${at}.description`} data-invalid={errors[`${at}.description`] ? 'true' : undefined}>
                  <TextField
                    label="What the AI should fill in"
                    value={field.description}
                    onChange={(event) => update(field.localId, { description: event.currentTarget.value })}
                    placeholder="e.g. The client or brand, when a logo makes it clear"
                    maxChars={limits.tagDescriptionMax}
                    error={errors[`${at}.description`]}
                    disabled={disabled}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div data-tag-move className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button ref={addRef} variant="secondary" onClick={() => add()} disabled={disabled || atLimit}>
          <Plus className="h-4 w-4" /> Add tag field
        </Button>
        {!atLimit && ideas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-ink-soft">Try</span>
            {ideas.map((idea) => (
              <button
                key={idea.label}
                type="button"
                onClick={() => add(idea.label, idea.description)}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-full border border-butter bg-butter-soft px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-lavender focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:opacity-60"
              >
                <Plus aria-hidden className="h-3 w-3" /> {idea.label}
              </button>
            ))}
          </div>
        )}
        <span className="text-xs font-semibold tabular-nums text-ink-soft sm:ml-auto" aria-live="polite">
          {atLimit
            ? `${fields.length} of ${limits.maxTagFields}: that’s the most a process can have`
            : `${fields.length} of ${limits.maxTagFields}`}
        </span>
      </div>
    </div>
  );
}
