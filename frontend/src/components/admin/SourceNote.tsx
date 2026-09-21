import type { AdminSettingSource } from '../../lib/api';

const SOURCE_COPY: Record<AdminSettingSource, { label: string; tone: string }> = {
  database: { label: 'Set here, overriding the environment', tone: 'bg-sage-soft text-sage-deep' },
  environment: { label: 'From the server’s environment variable', tone: 'bg-periwinkle-soft text-ink' },
  default: { label: 'Built-in default — nothing configured', tone: 'bg-line text-ink-soft' },
};

interface SourceNoteProps {
  source: AdminSettingSource;
  /** Omitted when the source isn't `database` — there's nothing to clear back to. */
  onClear?: () => void;
  clearing?: boolean;
  id?: string;
}

/**
 * Shows where a setting's effective value currently comes from, and — only when it came from the
 * database — a way to clear that override so the environment variable (or built-in default)
 * applies again. This is the whole point of the admin page: the owner can see why the app is
 * behaving the way it is, not just change it blind.
 */
export function SourceNote({ source, onClear, clearing = false, id }: SourceNoteProps) {
  const copy = SOURCE_COPY[source];
  return (
    <p id={id} className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      <span className={`rounded-full px-2.5 py-1 ${copy.tone}`}>{copy.label}</span>
      {source === 'database' && onClear && (
        <button
          type="button"
          onClick={onClear}
          disabled={clearing}
          className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60 disabled:cursor-wait disabled:opacity-60"
        >
          {clearing ? 'Clearing…' : 'Clear override'}
        </button>
      )}
    </p>
  );
}
