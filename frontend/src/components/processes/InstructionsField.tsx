import { useLayoutEffect, useRef, type MouseEvent } from 'react';
import { Check, Lightbulb, Plus } from 'lucide-react';
import { gsap, useGSAP, prefersReducedMotion } from '../../lib/gsap';
import { TextArea } from '../ui/TextField';

interface InstructionsFieldProps {
  value: string;
  onChange: (value: string) => void;
  maxChars: number;
  error?: string | null;
  disabled?: boolean;
}

const SUGGESTIONS = [
  'Photos with people in them go to Lifestyle, even when a product is visible.',
  'Keep subjects to two or three plain words, without brand names.',
  'Screenshots and scanned documents always go to Unsorted.',
];

/** Free-text guidance for the AI, with a few examples to start from. */
export function InstructionsField({ value, onChange, maxChars, error, disabled = false }: InstructionsFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollToEnd = useRef(false);

  const { contextSafe } = useGSAP({ scope: ref });

  // The example button turns disabled once added, so hand focus to the text with the caret after the new line.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!scrollToEnd.current || !textarea) return;
    scrollToEnd.current = false;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.scrollTop = textarea.scrollHeight;
  }, [value]);

  const pop = contextSafe((element: Element) => {
    gsap.fromTo(element, { scale: 0.88 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1.2, 0.4)', overwrite: 'auto' });
  });

  const append = (event: MouseEvent<HTMLButtonElement>, suggestion: string) => {
    const current = value.trimEnd();
    scrollToEnd.current = true;
    onChange(current ? `${current}\n${suggestion}` : suggestion);
    if (!prefersReducedMotion()) pop(event.currentTarget);
  };

  return (
    <div ref={ref} className="space-y-4">
      <div data-field="instructions" data-invalid={error ? 'true' : undefined}>
        <TextArea
          ref={textareaRef}
          label="Instructions"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          rows={5}
          maxChars={maxChars}
          placeholder="e.g. Anything with our mascot goes to Characters, even if it’s on a product."
          hint="Plain language is perfect. The AI follows these when it tags images and picks destinations."
          error={error}
          disabled={disabled}
        />
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-soft">
          <Lightbulb aria-hidden className="h-3.5 w-3.5" /> Need a nudge? Add an example
        </p>
        <ul className="flex flex-col gap-2">
          {SUGGESTIONS.map((suggestion) => {
            const added = value.includes(suggestion);
            return (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={(event) => append(event, suggestion)}
                  disabled={disabled || added}
                  aria-label={added ? `Added: ${suggestion}` : `Add: ${suggestion}`}
                  className={`flex w-full items-start gap-2 rounded-2xl border px-3.5 py-2.5 text-left text-sm font-semibold will-change-transform transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:cursor-not-allowed ${
                    added
                      ? 'border-sage bg-sage-soft text-ink-soft'
                      : 'border-line bg-white text-ink hover:border-lavender hover:bg-lavender-soft disabled:opacity-60'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${added ? 'bg-sage' : 'bg-lavender-soft'}`}
                  >
                    {added ? <Check className="h-3 w-3" strokeWidth={3} /> : <Plus className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">{suggestion}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
