import { useId, useState } from 'react';
import { CreditCard } from 'lucide-react';
import type { AdminSettingKey, AdminSettings, AdminSettingsValues, PlansResponse } from '../../lib/api';
import { formatPrice } from '../billing/planFeatures';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { describeAdminError } from './adminErrors';
import { SaveStatus, type SaveState } from './SaveStatus';
import { SourceNote } from './SourceNote';
import { useSyncedState } from './useSyncedState';
import { variantRows } from './variantRows';

interface PaymentsSectionProps {
  settings: AdminSettings;
  plans: PlansResponse;
  onSave: (patch: Partial<AdminSettingsValues>) => Promise<void>;
  onClear: (key: AdminSettingKey) => Promise<void>;
}

/**
 * The centrepiece: Lemon Squeezy store slug plus one labelled box per purchasable thing. The owner
 * pastes numbers into labelled boxes — never hand-writes JSON — and can turn on checkout for a
 * single plan at a time; nothing here requires filling in all 21 at once.
 */
export function PaymentsSection({ settings, plans, onSave, onClear }: PaymentsSectionProps) {
  const headingId = useId();
  const rows = variantRows(plans);

  const [storeValue, setStoreValue] = useSyncedState(settings.lemonSqueezyStore.value, settings.lemonSqueezyStore.value);
  const [storeState, setStoreState] = useState<SaveState>('idle');
  const [storeError, setStoreError] = useState<string | null>(null);

  const [variantValues, setVariantValues] = useSyncedState(
    JSON.stringify(settings.lemonSqueezyVariants.value),
    settings.lemonSqueezyVariants.value,
  );
  const [variantState, setVariantState] = useState<SaveState>('idle');
  const [variantError, setVariantError] = useState<string | null>(null);

  async function saveStore() {
    setStoreState('saving');
    setStoreError(null);
    try {
      await onSave({ lemonSqueezyStore: storeValue.trim() });
      setStoreState('saved');
    } catch (err) {
      setStoreState('error');
      setStoreError(describeAdminError(err, "Couldn't save the store slug"));
    }
  }

  async function clearStore() {
    setStoreState('saving');
    setStoreError(null);
    try {
      await onClear('lemonSqueezyStore');
      setStoreState('saved');
    } catch (err) {
      setStoreState('error');
      setStoreError(describeAdminError(err, "Couldn't clear the store slug override"));
    }
  }

  async function saveVariants() {
    setVariantState('saving');
    setVariantError(null);
    const next: Record<string, string> = {};
    for (const row of rows) {
      const value = (variantValues[row.id] ?? '').trim();
      if (value) next[row.id] = value;
    }
    try {
      await onSave({ lemonSqueezyVariants: next });
      setVariantState('saved');
    } catch (err) {
      setVariantState('error');
      setVariantError(describeAdminError(err, "Couldn't save the variant ids"));
    }
  }

  async function clearVariants() {
    setVariantState('saving');
    setVariantError(null);
    try {
      await onClear('lemonSqueezyVariants');
      setVariantState('saved');
    } catch (err) {
      setVariantState('error');
      setVariantError(describeAdminError(err, "Couldn't clear the variant ids override"));
    }
  }

  return (
    <section aria-labelledby={headingId} className="rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-periwinkle-soft" aria-hidden>
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <h2 id={headingId} className="text-xl font-bold">
            Payments
          </h2>
          <p className="text-sm font-semibold text-ink-soft">Lemon Squeezy store and variant ids.</p>
        </div>
      </div>

      <p className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold">
        <span className={`h-2.5 w-2.5 rounded-full ${plans.checkoutEnabled ? 'bg-sage-deep' : 'bg-ink-soft'}`} aria-hidden />
        {plans.checkoutEnabled
          ? 'Checkout is live — at least one plan or pack has a variant configured.'
          : 'Checkout isn’t live yet — every buy button shows "Coming soon" until the store slug and at least one variant are set.'}
      </p>

      <div className="mb-8 max-w-sm space-y-2">
        <TextField
          label="Store subdomain"
          value={storeValue}
          onChange={(event) => setStoreValue(event.target.value)}
          hint="The slug in yourstore.lemonsqueezy.com — not the numeric Store ID."
          maxLength={80}
          placeholder="yourstore"
        />
        <SourceNote source={settings.lemonSqueezyStore.source} onClear={() => void clearStore()} clearing={storeState === 'saving'} />
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button size="sm" onClick={() => void saveStore()} disabled={storeState === 'saving'}>
            {storeState === 'saving' ? 'Saving…' : 'Save store slug'}
          </Button>
          <SaveStatus state={storeState} error={storeError} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          {/* Counted, never written down: the row list comes from GET /api/plans, so a hard-coded
              number would start lying the moment the plan catalogue changes. */}
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-ink-soft">
            Variant ids — {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Name each Lemon Squeezy variant after the id shown, paste its numeric id here, then save. A plan or pack
            becomes purchasable on its own the moment its row is filled in — you don’t need all 21 at once.
          </p>
        </div>
        <SourceNote
          source={settings.lemonSqueezyVariants.source}
          onClear={() => void clearVariants()}
          clearing={variantState === 'saving'}
        />
      </div>

      <ul className="divide-y divide-line/60">
        {rows.map((row) => {
          const filled = (variantValues[row.id] ?? '').trim().length > 0;
          return (
            <li key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="font-bold text-ink">{row.label}</p>
                <p className="text-xs font-semibold text-ink-soft">
                  id: <code className="rounded bg-lavender-soft px-1.5 py-0.5 font-mono text-ink">{row.id}</code> ·{' '}
                  {formatPrice(row.price, plans.currency)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:w-64">
                <TextField
                  label={`Lemon Squeezy variant id for ${row.label}`}
                  hideLabel
                  value={variantValues[row.id] ?? ''}
                  onChange={(event) => setVariantValues((current) => ({ ...current, [row.id]: event.target.value }))}
                  placeholder="e.g. 123456"
                  inputMode="numeric"
                  className="text-right"
                />
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${filled ? 'bg-sage-soft text-sage-deep' : 'bg-line text-ink-soft'}`}
                >
                  {filled ? 'Filled' : 'Blank'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => void saveVariants()} disabled={variantState === 'saving'}>
          {variantState === 'saving' ? 'Saving…' : 'Save variant ids'}
        </Button>
        <SaveStatus state={variantState} error={variantError} savedLabel="Variant ids saved." />
      </div>
    </section>
  );
}
