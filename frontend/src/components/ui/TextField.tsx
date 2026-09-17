import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';

export const FIELD_CLASSES =
  'w-full rounded-2xl border bg-canvas px-4 py-3 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-ink-soft focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60';

function fieldTone(error?: string | null) {
  return error ? 'border-rose focus:border-rose focus:ring-rose/40' : 'border-line focus:border-lavender focus:ring-lavender/40';
}

interface FieldFrameProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  count?: { value: number; max: number };
  hideLabel?: boolean;
  children: ReactNode;
}

function FieldFrame({ id, label, hint, error, count, hideLabel, children }: FieldFrameProps) {
  const over = count ? count.value > count.max : false;
  return (
    <div className="space-y-1.5">
      <div className={`flex items-baseline justify-between gap-3 ${hideLabel ? 'sr-only' : ''}`}>
        <label htmlFor={id} className="text-sm font-bold text-ink">
          {label}
        </label>
        {count && (
          <span className={`text-xs font-semibold tabular-nums ${over ? 'text-rose-ink' : 'text-ink-soft'}`} aria-hidden>
            {count.value}/{count.max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p id={`${id}-message`} role="alert" className="text-xs font-semibold text-rose-ink">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-message`} className="text-xs leading-relaxed text-ink-soft">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & {
  label: ReactNode;
  value: string;
  hint?: ReactNode;
  error?: string | null;
  /** Shows a counter; typing past it is allowed so the error can explain. */
  maxChars?: number;
  hideLabel?: boolean;
  ref?: Ref<HTMLInputElement>;
};

export function TextField({ label, hint, error, maxChars, hideLabel, className = '', id, value, ref, ...rest }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
      count={maxChars ? { value: value.length, max: maxChars } : undefined}
    >
      <input
        ref={ref}
        id={fieldId}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-message` : undefined}
        className={`${FIELD_CLASSES} ${fieldTone(error)} ${className}`}
        {...rest}
      />
    </FieldFrame>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & {
  label: ReactNode;
  value: string;
  hint?: ReactNode;
  error?: string | null;
  maxChars?: number;
  hideLabel?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
};

export function TextArea({ label, hint, error, maxChars, hideLabel, className = '', id, value, rows = 4, ref, ...rest }: TextAreaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
      count={maxChars ? { value: value.length, max: maxChars } : undefined}
    >
      <textarea
        ref={ref}
        id={fieldId}
        value={value}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-message` : undefined}
        className={`${FIELD_CLASSES} ${fieldTone(error)} resize-y leading-relaxed ${className}`}
        {...rest}
      />
    </FieldFrame>
  );
}
