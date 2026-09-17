import { useId, useLayoutEffect, useRef, type MouseEvent, type PointerEvent, type SyntheticEvent } from 'react';
import { Eye, FileImage, Info, RotateCcw } from 'lucide-react';
import type { ProcessLimits } from '../../lib/api';
import { TEMPLATE_TOKENS, renderFileName, validateTemplate } from '../../lib/filename';
import { todayString } from '../../lib/format';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap';
import { TextField } from '../ui/TextField';
import { DEFAULT_TEMPLATE, UNSORTED_NAME, isUsableTagKey } from './processDraft';

interface NamingTemplateEditorProps {
  template: string;
  onChange: (template: string) => void;
  tagFields: { key: string; label: string }[];
  /** Names of the regular destinations, cycled through in the preview. */
  destinationNames: string[];
  fallbackName: string;
  processName: string;
  limits: ProcessLimits;
  error?: string | null;
  /** Saved processes get a note that renaming isn't retroactive. */
  existing?: boolean;
  disabled?: boolean;
}

const TOKEN_INFO: Record<string, string> = {
  destination: 'Destination name',
  subject: 'Main subject',
  style: 'Visual style',
  genre: 'Broad category',
  date: 'Date taken, or added to Drive',
  original: 'Original file name',
  process: 'Process name',
};

const SAMPLES = [
  { subject: 'coffee cup', style: 'flat lay', genre: 'product', original: 'IMG_2041.jpg', tags: ['acme', 'warm'] },
  { subject: 'acme wordmark', style: 'minimal', genre: 'branding', original: 'logo-final-v3.png', tags: ['acme', 'cool'] },
  { subject: 'city skyline', style: 'long exposure', genre: 'landscape', original: 'DSC_0087.jpg', tags: ['', 'warm'] },
];

const CHIP =
  'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left font-mono text-xs font-bold text-ink [overflow-wrap:anywhere] will-change-transform transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:cursor-not-allowed disabled:opacity-60';

/** The rename template: a text field, tokens that insert at the caret, and a live preview. */
export function NamingTemplateEditor({
  template,
  onChange,
  tagFields,
  destinationNames,
  fallbackName,
  processName,
  limits,
  error,
  existing = false,
  disabled = false,
}: NamingTemplateEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const previousNames = useRef<string[] | null>(null);
  const chipsLabelId = useId();

  const usableTags = tagFields
    .map((field) => ({ key: field.key.trim().toLowerCase(), label: field.label.trim() }))
    .filter((field, index, all) => isUsableTagKey(field.key) && all.findIndex((other) => other.key === field.key) === index);
  const tagKeys = tagFields.map((field) => field.key.trim().toLowerCase());

  const problems =
    template.trim().length > limits.templateMax
      ? [`Keep the naming template under ${limits.templateMax} characters.`]
      : validateTemplate(template.trim(), tagKeys);
  const shownError = problems[0] ?? error ?? null;

  // ---------------------------------------------------------------- preview

  const today = todayString();
  const regularNames = destinationNames.map((name) => name.trim()).filter(Boolean);
  const pool = regularNames.length > 0 ? regularNames : ['Product shots', 'Logos'];
  const examples = SAMPLES.map((sample, index) => {
    const destination = index === SAMPLES.length - 1 ? fallbackName.trim() || UNSORTED_NAME : pool[index % pool.length];
    const tags = Object.fromEntries(
      usableTags.map((field, fieldIndex) => [field.key, sample.tags[fieldIndex % sample.tags.length]]),
    );
    const fileName = renderFileName(
      template,
      {
        destination,
        subject: sample.subject,
        style: sample.style,
        genre: sample.genre,
        date: today,
        original: sample.original,
        process: processName.trim() || 'My process',
        tags,
      },
      { originalName: sample.original },
    );
    return { destination, original: sample.original, fileName };
  });
  const previewKey = examples.map((example) => example.fileName).join('\n');

  // Nudge the preview rows whose name just changed.
  useGSAP(
    () => {
      const names = previewKey.split('\n');
      const previous = previousNames.current;
      previousNames.current = names;
      if (!previous || prefersReducedMotion()) return;
      const changed = gsap.utils
        .toArray<HTMLElement>('[data-preview-name]', ref.current)
        .filter((_, index) => previous[index] !== names[index]);
      if (changed.length === 0) return;
      gsap.fromTo(
        changed,
        { autoAlpha: 0.35, y: 5 },
        { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.04, overwrite: true },
      );
    },
    { dependencies: [previewKey], scope: ref },
  );

  // ---------------------------------------------------------------- token insertion

  const { contextSafe } = useGSAP({ scope: ref });

  // Put the caret right after an inserted token once React has rendered the new value.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const input = inputRef.current;
    if (caret === null || !input) return;
    pendingCaret.current = null;
    input.focus({ preventScroll: true });
    input.setSelectionRange(caret, caret);
  }, [template]);

  const rememberSelection = (event: SyntheticEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    selection.current = {
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
    };
  };

  const insertToken = (token: string) => {
    const start = Math.min(selection.current?.start ?? template.length, template.length);
    const end = Math.min(Math.max(selection.current?.end ?? template.length, start), template.length);
    const before = template.slice(0, start);
    const after = template.slice(end);
    // Keep tokens from running into each other: "{a}{b}" would read as one word.
    const lead = /[}A-Za-z0-9)]$/.test(before) ? '_' : '';
    const trail = /^[{A-Za-z0-9(]/.test(after) ? '_' : '';
    const caret = before.length + lead.length + token.length;
    pendingCaret.current = caret;
    selection.current = { start: caret, end: caret };
    onChange(`${before}${lead}${token}${trail}${after}`);
  };

  const squish = contextSafe((event: PointerEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion() || event.currentTarget.disabled) return;
    gsap.to(event.currentTarget, { scale: 0.88, duration: 0.12, overwrite: 'auto' });
  });

  const settle = contextSafe((event: PointerEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion()) return;
    gsap.to(event.currentTarget, { scale: 1, duration: 0.4, overwrite: 'auto' });
  });

  const pop = contextSafe((element: Element) => {
    gsap.fromTo(element, { scale: 0.84 }, { scale: 1, duration: 0.75, ease: 'elastic.out(1.2, 0.35)', overwrite: 'auto' });
  });

  const handleChip = (event: MouseEvent<HTMLButtonElement>, token: string) => {
    insertToken(token);
    if (!prefersReducedMotion()) pop(event.currentTarget);
  };

  const chipHandlers = {
    // Clicking a chip shouldn't pull focus (and the caret) out of the template field.
    onMouseDown: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    onPointerDown: squish,
    onPointerLeave: settle,
  };

  const reset = () => {
    selection.current = null;
    onChange(DEFAULT_TEMPLATE);
  };

  return (
    <div ref={ref} className="space-y-5">
      <div data-field="renameTemplate" data-invalid={shownError ? 'true' : undefined}>
        <TextField
          ref={inputRef}
          label="Naming template"
          value={template}
          onChange={(event) => {
            rememberSelection(event);
            onChange(event.currentTarget.value);
          }}
          onSelect={rememberSelection}
          maxChars={limits.templateMax}
          error={shownError}
          hint="Mix tokens with your own text. Letters, numbers, spaces and - _ . ( ) are fine."
          className="font-mono"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          disabled={disabled}
        />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p id={chipsLabelId} className="text-xs font-extrabold uppercase tracking-wider text-ink-soft">
            Insert a token
          </p>
          {template !== DEFAULT_TEMPLATE && (
            <button
              type="button"
              onClick={reset}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-lg px-1 text-xs font-bold text-lavender-deep transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to {DEFAULT_TEMPLATE}
            </button>
          )}
        </div>
        <div role="group" aria-labelledby={chipsLabelId} className="flex flex-wrap gap-2">
          {TEMPLATE_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              {...chipHandlers}
              onClick={(event) => handleChip(event, `{${token}}`)}
              disabled={disabled}
              title={TOKEN_INFO[token]}
              aria-label={`Insert {${token}}: ${TOKEN_INFO[token] ?? token}`}
              className={`${CHIP} border-line bg-lavender-soft hover:border-lavender`}
            >
              {`{${token}}`}
            </button>
          ))}
          {usableTags.map((field) => (
            <button
              key={field.key}
              type="button"
              {...chipHandlers}
              onClick={(event) => handleChip(event, `{tag:${field.key}}`)}
              disabled={disabled}
              title={field.label || field.key}
              aria-label={`Insert {tag:${field.key}}: ${field.label || 'custom tag'}`}
              className={`${CHIP} border-butter bg-butter-soft hover:border-lavender`}
            >
              {`{tag:${field.key}}`}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-dashed border-line p-4 sm:p-5">
        <p className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-ink-soft">
          <Eye className="h-3.5 w-3.5" /> Preview
        </p>
        <ul className={`space-y-2 transition-opacity ${problems.length > 0 ? 'opacity-50' : ''}`}>
          {examples.map((example, index) => (
            <li
              key={index}
              className="flex min-w-0 flex-col gap-1 rounded-2xl bg-white px-3.5 py-2.5 shadow-soft sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileImage aria-hidden className="h-4 w-4 shrink-0 text-lavender-deep" />
                <span data-preview-name className="block min-w-0 font-mono text-sm font-bold text-ink [overflow-wrap:anywhere]">
                  {example.fileName}
                </span>
              </span>
              <span className="min-w-0 pl-6 text-xs text-ink-soft [overflow-wrap:anywhere] sm:ml-auto sm:max-w-[45%] sm:pl-0 sm:text-right">
                {example.original} → {example.destination}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          {problems.length > 0
            ? 'Fix the template above and the preview will make sense again.'
            : 'Token values become lowercase words joined by hyphens, and each file keeps its extension. Empty tokens drop out.'}
        </p>
      </div>

      {existing && (
        <p className="flex items-start gap-2 rounded-2xl bg-periwinkle-soft px-4 py-3 text-xs font-semibold leading-relaxed text-ink">
          <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
          Changing the template only affects images sorted from now on.
        </p>
      )}
    </div>
  );
}
