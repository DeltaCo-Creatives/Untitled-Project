import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { CircleAlert, Trash2, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api, ApiError } from '../../lib/api';
import { errorMessage } from '../../lib/messages';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { TextField } from '../ui/TextField';

const CONFIRM_WORD = 'DELETE';

const linkClass =
  'rounded font-extrabold text-ink underline decoration-lavender decoration-2 underline-offset-2 hover:decoration-lavender-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60';

interface AccountCardProps {
  className?: string;
}

/** Signed-in email, a link explaining data deletion, and the self-service "Delete account" flow. */
export function AccountCard({ className = '' }: AccountCardProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (deleting) return;
    setOpen(false);
    setConfirmText('');
    setError(null);
  };

  const confirmDeletion = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount();
    } catch (err) {
      setDeleting(false);
      setError(
        err instanceof ApiError && err.code === 'sorting_in_progress'
          ? err.message
          : errorMessage(err, 'Couldn’t delete your account'),
      );
      return;
    }
    // The account is gone at this point, so a failed server-side sign-out must not read as a failed deletion:
    // fall back to clearing the local session, which needs no network.
    await signOut().catch(() => supabase.auth.signOut({ scope: 'local' }));
    navigate('/', { replace: true });
  };

  return (
    <section
      aria-labelledby="account-heading"
      className={`flex flex-col rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8 ${className}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lavender-soft" aria-hidden>
          <User className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 id="account-heading" className="text-xl font-bold">
            Account
          </h2>
          {user?.email && (
            <p className="truncate text-sm font-semibold text-ink-soft" title={user.email}>
              {user.email}
            </p>
          )}
        </div>
      </div>

      <p className="mb-5 text-sm leading-relaxed text-ink-soft">
        You can delete your DriveTag account at any time.{' '}
        <Link to="/data-deletion" className={linkClass}>
          How data deletion works
        </Link>
      </p>

      <div className="mt-auto">
        <Button variant="secondary" size="sm" className="text-rose-ink hover:border-rose" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" aria-hidden /> Delete account
        </Button>
      </div>

      {/* Portaled: the card's entrance transform would otherwise trap the fixed-position dialog inside it. */}
      {open &&
        createPortal(
          <ConfirmDialog
            open
            title="Delete your account?"
            confirmLabel={deleting ? 'Deleting…' : 'Delete account'}
            busy={deleting}
            confirmDisabled={confirmText !== CONFIRM_WORD}
            onConfirm={() => void confirmDeletion()}
            onCancel={close}
          >
            <div className="space-y-4">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Automatic sorting stops immediately.</li>
                <li>DriveTag’s access to your Google Drive is revoked.</li>
                <li>Your work processes, activity history, usage and account are permanently deleted.</li>
              </ul>
              <p>
                Files already in your Google Drive are <strong className="font-extrabold text-ink">not</strong> deleted or
                moved back — they stay exactly where they are.
              </p>
              <p className="font-bold text-ink">This can’t be undone.</p>
              <TextField
                label="Type DELETE to confirm"
                hint="Case-sensitive."
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
                disabled={deleting}
              />
              {error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}
            </div>
          </ConfirmDialog>,
          document.body,
        )}
    </section>
  );
}
