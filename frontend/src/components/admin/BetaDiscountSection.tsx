import { useId, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { AdminSettingsValues, AdminSettings, PlansResponse } from '../../lib/api';
import { formatPrice } from '../billing/planFeatures';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { describeAdminError } from './adminErrors';
import { SaveStatus, type SaveState } from './SaveStatus';
import { SourceNote } from './SourceNote';
import { useSyncedState } from './useSyncedState';

interface BetaDiscountSectionProps {
  settings: AdminSettings;
  plans: PlansResponse;
  onSave: (patch: Partial<AdminSettingsValues>) => Promise<void>;
  onClear: (key: 'betaDiscountPercent' | 'betaDiscountCode') => Promise<void>;
}

const MAX_PERCENT = 90;
// The plan named in DeveloperToDo.md §3.4 as the worst case at full allowance use — the one a
// blanket 50% actually loses money on. Falls back to any paid plan if the catalog ever changes.
// The worked example defaults to the most expensive plan, because that is where a discount hurts
// most — the margin warning below is about exactly that plan. Derived, not a hard-coded id, so it
// stays correct if the catalogue changes.

/**
 * The closed-beta discount percent and code, with the honest margin warning from
 * DeveloperToDo.md §3.4 and a live worked-example price computed from GET /api/plans, so the
 * number the owner types is never abstract.
 */
export function BetaDiscountSection({ settings, plans, onSave, onClear }: BetaDiscountSectionProps) {
  const headingId = useId();

  const [percent, setPercent] = useSyncedState(settings.betaDiscountPercent.value, String(settings.betaDiscountPercent.value));
  const [code, setCode] = useSyncedState(settings.betaDiscountCode.value, settings.betaDiscountCode.value);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  const paidPlans = useMemo(() => plans.plans.filter((plan) => plan.family !== 'free'), [plans.plans]);
  const [examplePlanId, setExamplePlanId] = useState<string>(
    () => [...paidPlans].sort((a, b) => b.price.monthly - a.price.monthly)[0]?.id ?? '',
  );
  const examplePlan = paidPlans.find((plan) => plan.id === examplePlanId) ?? paidPlans[0] ?? null;

  const percentNumber = Number(percent);
  const percentValid = percent.trim() !== '' && Number.isInteger(percentNumber) && percentNumber >= 0 && percentNumber <= MAX_PERCENT;
  // An empty box is just as invalid as a bad number and disables Save either way, so it has to say so.
  // Silently disabling the button reads as the page being broken rather than the field needing a value.
  const percentError = percentValid
    ? null
    : percent.trim() === ''
      ? 'Enter a percentage. Use 0 to turn the discount off.'
      : `Enter a whole number from 0 to ${MAX_PERCENT}.`;

  const discounted = examplePlan && percentValid ? examplePlan.price.monthly * (1 - percentNumber / 100) : null;

  async function save() {
    if (!percentValid) return;
    setSaveState('saving');
    setError(null);
    try {
      await onSave({ betaDiscountPercent: percentNumber, betaDiscountCode: code.trim() });
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setError(describeAdminError(err, "Couldn't save the beta discount"));
    }
  }

  async function clearField(key: 'betaDiscountPercent' | 'betaDiscountCode') {
    setSaveState('saving');
    setError(null);
    try {
      await onClear(key);
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setError(describeAdminError(err, "Couldn't clear that override"));
    }
  }

  return (
    <section aria-labelledby={headingId} className="rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-butter-soft" aria-hidden>
          <TriangleAlert className="h-5 w-5" />
        </span>
        <div>
          <h2 id={headingId} className="text-xl font-bold">
            Closed beta discount
          </h2>
          <p className="text-sm font-semibold text-ink-soft">What approved testers see struck through on /plans.</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-butter bg-butter-soft px-4 py-3 text-sm leading-relaxed text-ink">
        <p className="font-bold">A blanket discount eats margin faster than it cuts price.</p>
        <p className="mt-1">
          The AI cost per file doesn’t fall when the price does. At full allowance use, a flat 50% off loses money on
          Images + Documents Enterprise (about $10/month per fully-used subscriber) — Images and Documents Enterprise
          alone land at just 2% and 6% margin. Complete Enterprise breaks even at 42.8%. <strong>30% is the safe
          blanket number.</strong> This setting only controls what the website displays — keep any Lemon Squeezy
          discount code in step with it, since the code applies at checkout regardless of what the site shows.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <TextField
            label="Discount percent"
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            type="number"
            min={0}
            max={MAX_PERCENT}
            step={1}
            inputMode="numeric"
            hint={!percentError ? '0 turns the discount off.' : undefined}
            error={percentError}
          />
          <SourceNote
            source={settings.betaDiscountPercent.source}
            onClear={() => void clearField('betaDiscountPercent')}
            clearing={saveState === 'saving'}
          />
        </div>
        <div className="space-y-2">
          <TextField
            label="Discount code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxChars={60}
            hint="Shown to every approved tester — treat it as semi-public. Empty turns it off."
            placeholder="BETA30"
          />
          <SourceNote
            source={settings.betaDiscountCode.source}
            onClear={() => void clearField('betaDiscountCode')}
            clearing={saveState === 'saving'}
          />
        </div>
      </div>

      {paidPlans.length > 0 && (
        <div className="mt-6 rounded-2xl bg-lavender-soft px-4 py-3 text-sm">
          <label htmlFor={`${headingId}-example`} className="mb-1.5 block text-xs font-bold text-ink">
            Preview against
          </label>
          <select
            id={`${headingId}-example`}
            value={examplePlanId}
            onChange={(event) => setExamplePlanId(event.target.value)}
            className="mb-2 w-full max-w-xs rounded-2xl border border-ink-soft/80 bg-white px-3 py-2 text-sm font-semibold text-ink focus:border-lavender focus:outline-none focus:ring-4 focus:ring-lavender/40"
          >
            {paidPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.label} ({plan.family})
              </option>
            ))}
          </select>
          <p className="font-semibold text-ink" aria-live="polite">
            {examplePlan && discounted !== null
              ? `At ${percentNumber}% off, a tester would pay ${formatPrice(discounted, plans.currency)}/month instead of ${formatPrice(examplePlan.price.monthly, plans.currency)}/month.`
              : 'Enter a valid percent to see the example price.'}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={saveState === 'saving' || !percentValid}>
          {saveState === 'saving' ? 'Saving…' : 'Save beta discount'}
        </Button>
        <SaveStatus state={saveState} error={error} savedLabel="Beta discount saved." />
      </div>
    </section>
  );
}
