export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SaveStatusProps {
  id?: string;
  state: SaveState;
  savingLabel?: string;
  savedLabel?: string;
  error?: string | null;
}

/**
 * A persistent (always-mounted) live region for one save action's outcome. Persistent, not
 * mount-on-message, so assistive tech reliably announces success and failure alike — a region
 * that only appears once there's something to say is not reliably picked up by screen readers.
 */
export function SaveStatus({ id, state, savingLabel = 'Saving…', savedLabel = 'Saved.', error }: SaveStatusProps) {
  return (
    <p id={id} role="status" aria-live="polite" className="min-h-[1.25rem] text-sm font-semibold">
      {state === 'saving' && <span className="text-ink-soft motion-reduce:animate-none">{savingLabel}</span>}
      {state === 'saved' && <span className="text-sage-deep">{savedLabel}</span>}
      {state === 'error' && error && (
        <span role="alert" className="text-rose-ink">
          {error}
        </span>
      )}
    </p>
  );
}
