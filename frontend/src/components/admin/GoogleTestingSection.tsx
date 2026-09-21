import { useId, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { AdminSettings, AdminSettingsValues } from '../../lib/api';
import { Switch } from '../ui/Switch';
import { describeAdminError } from './adminErrors';
import { SaveStatus, type SaveState } from './SaveStatus';
import { SourceNote } from './SourceNote';
import { useSyncedState } from './useSyncedState';

interface GoogleTestingSectionProps {
  settings: AdminSettings;
  onSave: (patch: Partial<AdminSettingsValues>) => Promise<void>;
  onClear: (key: 'googleAppTesting') => Promise<void>;
}

/** The one switch that drives the dashboard's 7-day Drive-reconnect warning. */
export function GoogleTestingSection({ settings, onSave, onClear }: GoogleTestingSectionProps) {
  const headingId = useId();
  const [checked, setChecked] = useSyncedState(settings.googleAppTesting.value, settings.googleAppTesting.value);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save(next: boolean) {
    setChecked(next);
    setSaveState('saving');
    setError(null);
    try {
      await onSave({ googleAppTesting: next });
      setSaveState('saved');
    } catch (err) {
      setChecked(!next);
      setSaveState('error');
      setError(describeAdminError(err, "Couldn't save the Google testing setting"));
    }
  }

  async function clear() {
    setSaveState('saving');
    setError(null);
    try {
      await onClear('googleAppTesting');
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setError(describeAdminError(err, "Couldn't clear the Google testing override"));
    }
  }

  return (
    <section aria-labelledby={headingId} className="rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-soft" aria-hidden>
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div>
          <h2 id={headingId} className="text-xl font-bold">
            Google
          </h2>
          <p className="text-sm font-semibold text-ink-soft">Whether the OAuth app is still in Google's Testing status.</p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-2xl bg-canvas px-4 py-3">
        <div>
          <p id={`${headingId}-label`} className="font-bold text-ink">
            Warn testers about the 7-day reconnect
          </p>
          <p id={`${headingId}-hint`} className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
            While Google's review is pending, Drive refresh tokens expire every 7 days and testers must reconnect.
            Turn this on to show that warning on the dashboard from day 5. Turn it off the day OAuth app verification
            is granted — the warning would otherwise describe a limit that no longer applies.
          </p>
        </div>
        <Switch
          checked={checked}
          onChange={(next) => void save(next)}
          label="Warn testers about the 7-day Drive reconnect"
          describedBy={`${headingId}-hint`}
          busy={saveState === 'saving'}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SourceNote source={settings.googleAppTesting.source} onClear={() => void clear()} clearing={saveState === 'saving'} />
      </div>
      <div className="mt-2">
        <SaveStatus state={saveState} error={error} savedLabel="Saved." />
      </div>
    </section>
  );
}
