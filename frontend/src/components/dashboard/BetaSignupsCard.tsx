import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, ClipboardCopy, Download, Users } from 'lucide-react';
import { api, type BetaSignup } from '../../lib/api';
import { errorMessage } from '../../lib/messages';
import { formatDate } from '../../lib/format';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';

// Google Auth Platform caps the OAuth "Testing" audience at 100 accounts. That's Google's number, not
// something GET /api/plans or any other backend response reports — hence the local constant.
const GOOGLE_TESTER_CAP = 100;

interface BetaSignupsCardProps {
  className?: string;
}

/**
 * Admin-only convenience for managing beta signups: a table, a per-row "added" checkbox (optimistic,
 * rolled back on failure), a clipboard export of pending emails, and a CSV download. Rendered on the
 * dashboard only when `me.admin` — the backend 403s regardless, so this is never the actual gate.
 * Pure table + checkboxes, no GSAP.
 */
export function BetaSignupsCard({ className = '' }: BetaSignupsCardProps) {
  const [signups, setSignups] = useState<BetaSignup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const [copyFallback, setCopyFallback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listBetaSignups().then(
      (response) => {
        if (active) setSignups(response.signups);
      },
      (err: unknown) => {
        if (active) setLoadError(errorMessage(err, 'Couldn’t load beta signups'));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const addedCount = signups?.filter((signup) => signup.addedToGoogle).length ?? 0;

  async function toggleAdded(signup: BetaSignup, next: boolean) {
    if (!signups) return;
    setRowError(null);
    setSavingId(signup.id);
    const applyTo = (rows: BetaSignup[] | null, value: boolean, addedAt: string | null) =>
      rows?.map((row) => (row.id === signup.id ? { ...row, addedToGoogle: value, addedAt } : row)) ?? null;

    setSignups((rows) => applyTo(rows, next, next ? new Date().toISOString() : null));
    try {
      await api.updateBetaSignup(signup.id, { addedToGoogle: next });
    } catch (err) {
      // Revert only this row, from whatever the list looks like now. Restoring a snapshot taken at
      // click time would also undo any other row the admin toggled while this request was in flight.
      setSignups((rows) => applyTo(rows, signup.addedToGoogle, signup.addedAt));
      setRowError(errorMessage(err, 'Couldn’t update that signup'));
    } finally {
      setSavingId(null);
    }
  }

  async function copyPending() {
    const pending = (signups ?? []).filter((signup) => !signup.addedToGoogle).map((signup) => signup.email);
    if (pending.length === 0) {
      setLiveMessage('No pending addresses to copy.');
      return;
    }
    const text = pending.join(', ');
    try {
      await navigator.clipboard.writeText(text);
      setCopyFallback(null);
      setLiveMessage(`${pending.length} ${pending.length === 1 ? 'address' : 'addresses'} copied.`);
    } catch {
      setCopyFallback(text);
      setLiveMessage('Couldn’t copy automatically — select the text below and copy it manually.');
    }
  }

  async function downloadCsv() {
    try {
      await api.downloadBetaSignupsCsv();
    } catch (err) {
      setLoadError(errorMessage(err, 'Couldn’t download the CSV'));
    }
  }

  return (
    <section
      aria-labelledby="beta-signups-heading"
      className={`rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8 ${className}`}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-butter-soft" aria-hidden>
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h2 id="beta-signups-heading" className="text-xl font-bold">
              Beta signups
            </h2>
            <p className="text-sm font-semibold text-ink-soft">
              {addedCount} of {GOOGLE_TESTER_CAP} Google tester slots used
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copyPending()} disabled={!signups || signups.length === 0}>
            <ClipboardCopy className="h-4 w-4" aria-hidden /> Copy pending emails
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void downloadCsv()} disabled={!signups || signups.length === 0}>
            <Download className="h-4 w-4" aria-hidden /> Download CSV
          </Button>
        </div>
      </div>

      {/* Persistent (not mount-on-change) so clipboard/download outcomes are reliably announced. */}
      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {copyFallback && (
        <div className="mb-4">
          <label htmlFor="beta-copy-fallback" className="mb-1 block text-xs font-bold text-ink-soft">
            Clipboard access was blocked — copy this list manually
          </label>
          <textarea
            id="beta-copy-fallback"
            readOnly
            value={copyFallback}
            rows={3}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-2xl border border-ink-soft/80 bg-canvas px-3 py-2 text-xs text-ink focus:outline-none focus:ring-4 focus:ring-lavender/40"
          />
        </div>
      )}

      {rowError && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {rowError}
        </p>
      )}

      {loadError ? (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {loadError}
        </p>
      ) : signups === null ? (
        <div role="status">
          <span className="sr-only">Loading beta signups…</span>
          <Skeleton className="h-40" />
        </div>
      ) : signups.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-soft">
          No one has requested beta access yet. Share the{' '}
          <Link
            to="/beta"
            className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
          >
            /beta
          </Link>{' '}
          page to start collecting signups.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Beta signups, with email, name, what they do, weekly volume, signup date, and whether each has been
              added to the Google tester list.
            </caption>
            <thead>
              <tr className="border-b border-line text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                <th scope="col" className="py-2 pr-3">
                  Email
                </th>
                <th scope="col" className="py-2 pr-3">
                  Name
                </th>
                <th scope="col" className="py-2 pr-3">
                  What they do
                </th>
                <th scope="col" className="py-2 pr-3">
                  Volume
                </th>
                <th scope="col" className="py-2 pr-3">
                  Signed up
                </th>
                <th scope="col" className="py-2 pr-3">
                  Added?
                </th>
              </tr>
            </thead>
            <tbody>
              {signups.map((signup) => (
                <tr key={signup.id} className="border-b border-line/60">
                  <td className="py-2 pr-3">{signup.email}</td>
                  <td className="py-2 pr-3">{signup.name}</td>
                  <td className="py-2 pr-3 text-ink-soft">{signup.workType || '—'}</td>
                  <td className="py-2 pr-3 text-ink-soft">{signup.weeklyVolume || '—'}</td>
                  <td className="py-2 pr-3 text-ink-soft">{formatDate(signup.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={signup.addedToGoogle}
                      disabled={savingId === signup.id}
                      onChange={(event) => void toggleAdded(signup, event.target.checked)}
                      aria-label={`Mark ${signup.email} as added to the Google tester list`}
                      className="h-4 w-4 rounded border-ink-soft/80 accent-sage-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
