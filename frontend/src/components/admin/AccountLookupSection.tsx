import { useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, UserSearch } from 'lucide-react';
import { api, type AdminUser, type PlansResponse } from '../../lib/api';
import { formatCount, formatDate } from '../../lib/format';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { TextField } from '../ui/TextField';
import { describeAdminError } from './adminErrors';
import { SaveStatus, type SaveState } from './SaveStatus';

interface AccountLookupSectionProps {
  plans: PlansResponse;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const SELECT_CLASSES =
  'w-full rounded-2xl border border-ink-soft/80 bg-canvas px-4 py-3 text-sm font-semibold text-ink focus:border-lavender focus:outline-none focus:ring-4 focus:ring-lavender/40';

/** Look up one account by email, then set its plan/status or grant/remove credits by hand — the
 * tool for comped accounts, manual sales and support fixes until checkout covers everything. */
export function AccountLookupSection({ plans }: AccountLookupSectionProps) {
  const headingId = useId();
  const planFieldId = useId();
  const statusFieldId = useId();
  const kindFieldId = useId();

  const [email, setEmail] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // undefined: no lookup yet. null: looked up, no such account.
  const [account, setAccount] = useState<AdminUser | null | undefined>(undefined);

  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState('active');
  const [restartPeriod, setRestartPeriod] = useState(false);
  const [planState, setPlanState] = useState<SaveState>('idle');
  const [planError, setPlanError] = useState<string | null>(null);

  const [kind, setKind] = useState<'image' | 'document'>('image');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [creditState, setCreditState] = useState<SaveState>('idle');
  const [creditError, setCreditError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const familyLabel = (familyId: string) => plans.families.find((family) => family.id === familyId)?.label ?? familyId;

  function applyAccount(user: AdminUser | null) {
    setAccount(user);
    if (user) {
      setPlanId(user.plan);
      // null means "no subscriptions row yet" (never connected Drive) — 'active' is the sensible
      // starting status for the row "Update plan" is about to create.
      setStatus(user.status ?? 'active');
    }
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setLookupLoading(true);
    setLookupError(null);
    setPlanState('idle');
    setCreditState('idle');
    try {
      const res = await api.admin.lookupUser(trimmed);
      applyAccount(res.user);
    } catch (err) {
      setAccount(undefined);
      setLookupError(describeAdminError(err, "Couldn't look up that account"));
    } finally {
      setLookupLoading(false);
    }
  }

  async function submitPlan(event: FormEvent) {
    event.preventDefault();
    if (!account || !planId) return;
    setPlanState('saving');
    setPlanError(null);
    try {
      const res = await api.admin.setUserPlan({ email: account.email, plan: planId, status, restartPeriod });
      applyAccount(res.user);
      setPlanState('saved');
      setRestartPeriod(false);
    } catch (err) {
      setPlanState('error');
      setPlanError(describeAdminError(err, "Couldn't update the plan"));
    }
  }

  const parsedAmount = Number(amount);
  const amountValid = amount.trim() !== '' && Number.isInteger(parsedAmount) && parsedAmount !== 0;
  const reasonValid = reason.trim().length > 0 && reason.trim().length <= 200;

  function submitCredits(event: FormEvent) {
    event.preventDefault();
    if (!account || !amountValid || !reasonValid) return;
    if (parsedAmount < 0) {
      setConfirmOpen(true);
      return;
    }
    void performGrant();
  }

  async function performGrant() {
    if (!account) return;
    setConfirmOpen(false);
    setCreditState('saving');
    setCreditError(null);
    try {
      const res = await api.admin.grantCredits({ email: account.email, kind, amount: parsedAmount, reason: reason.trim() });
      applyAccount(res.user);
      setCreditState('saved');
      setAmount('');
      setReason('');
    } catch (err) {
      setCreditState('error');
      setCreditError(describeAdminError(err, "Couldn't update credits"));
    }
  }

  return (
    <section aria-labelledby={headingId} className="rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lavender-soft" aria-hidden>
          <UserSearch className="h-5 w-5" />
        </span>
        <div>
          <h2 id={headingId} className="text-xl font-bold">
            Accounts
          </h2>
          <p className="text-sm font-semibold text-ink-soft">Set a plan or grant/remove credits for one account.</p>
        </div>
      </div>

      <form onSubmit={(event) => void lookup(event)} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <TextField
            label="Account email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="client@example.com"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={lookupLoading || email.trim() === ''}>
          {lookupLoading ? 'Looking up…' : 'Look up'}
        </Button>
      </form>
      <SaveStatus state={lookupLoading ? 'saving' : lookupError ? 'error' : 'idle'} savingLabel="Looking up…" error={lookupError} />

      {account === null && (
        <p className="mt-2 text-sm font-semibold text-ink-soft">No DriveTag account for that email.</p>
      )}

      {account && (
        <div className="mt-6 space-y-6 border-t border-line pt-6">
          <div className="rounded-2xl bg-canvas px-4 py-3 text-sm">
            <p className="font-bold text-ink">{account.email}</p>
            <p className="mt-1 text-ink-soft">
              Plan <strong className="font-extrabold text-ink">{account.plan}</strong> · status{' '}
              <strong className="font-extrabold text-ink">{account.status ?? 'no subscription yet'}</strong> · joined{' '}
              {formatDate(account.createdAt)}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {account.usage ? (
                <>
                  <p className="text-ink-soft">
                    Images: <strong className="font-extrabold text-ink">{formatCount(account.usage.images.remaining)}</strong>{' '}
                    remaining ({formatCount(account.usage.images.topupBalance)} from packs)
                  </p>
                  <p className="text-ink-soft">
                    Documents:{' '}
                    <strong className="font-extrabold text-ink">{formatCount(account.usage.documents.remaining)}</strong> remaining
                    ({formatCount(account.usage.documents.topupBalance)} from packs)
                  </p>
                </>
              ) : (
                <p className="text-ink-soft">This account hasn't connected Google Drive yet, so it has no usage yet.</p>
              )}
            </div>
          </div>

          <form onSubmit={(event) => void submitPlan(event)} className="space-y-3">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-ink-soft">Set plan</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={planFieldId} className="mb-1.5 block text-sm font-bold text-ink">
                  Plan
                </label>
                <select id={planFieldId} value={planId} onChange={(event) => setPlanId(event.target.value)} className={SELECT_CLASSES}>
                  {plans.plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.id === 'free' ? 'Free' : `${familyLabel(plan.family)} · ${plan.label}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={statusFieldId} className="mb-1.5 block text-sm font-bold text-ink">
                  Status
                </label>
                <select id={statusFieldId} value={status} onChange={(event) => setStatus(event.target.value)} className={SELECT_CLASSES}>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={restartPeriod}
                    onChange={(event) => setRestartPeriod(event.target.checked)}
                    className="h-4 w-4 rounded border-ink-soft/80 accent-sage-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
                  />
                  Restart billing period now
                </label>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-ink-soft">
              Changing the plan always restarts the period; check this to also restart it when only the status changes.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={planState === 'saving'}>
                {planState === 'saving' ? 'Saving…' : 'Update plan'}
              </Button>
              <SaveStatus state={planState} error={planError} savedLabel="Plan updated." />
            </div>
          </form>

          <form onSubmit={submitCredits} className="space-y-3 border-t border-line pt-6">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-ink-soft">Grant or remove credits</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={kindFieldId} className="mb-1.5 block text-sm font-bold text-ink">
                  Kind
                </label>
                <select
                  id={kindFieldId}
                  value={kind}
                  onChange={(event) => setKind(event.target.value as 'image' | 'document')}
                  className={SELECT_CLASSES}
                >
                  <option value="image">Image credits</option>
                  <option value="document">Document credits</option>
                </select>
              </div>
              <TextField
                label="Amount"
                hint="Negative removes credits."
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                type="number"
                step={1}
                inputMode="numeric"
              />
              <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxChars={200} placeholder="Invoice #, refund, goodwill…" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={creditState === 'saving' || !amountValid || !reasonValid}>
                {creditState === 'saving' ? 'Saving…' : 'Apply credits'}
              </Button>
              <SaveStatus state={creditState} error={creditError} savedLabel="Credits updated." />
            </div>
          </form>
        </div>
      )}

      {account &&
        createPortal(
          <ConfirmDialog
            open={confirmOpen}
            title="Remove credits?"
            confirmLabel={creditState === 'saving' ? 'Removing…' : 'Remove credits'}
            busy={creditState === 'saving'}
            onConfirm={() => void performGrant()}
            onCancel={() => setConfirmOpen(false)}
          >
            <div className="space-y-3">
              <p className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-ink" aria-hidden />
                This removes {amountValid ? formatCount(Math.abs(parsedAmount)) : ''} {kind} credit
                {Math.abs(parsedAmount) === 1 ? '' : 's'} from <strong className="font-extrabold text-ink">{account.email}</strong>.
              </p>
              <p>They keep whatever they've already used; this can't be undone automatically.</p>
            </div>
          </ConfirmDialog>,
          document.body,
        )}
    </section>
  );
}
