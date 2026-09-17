import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, HardDrive, Unplug } from 'lucide-react';
import { api } from '../../lib/api';
import { gsap, useGSAP, MOTION_OK } from '../../lib/gsap';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface ConnectionCardProps {
  /** Re-fetch the dashboard once Drive is disconnected. */
  onDisconnected: () => Promise<void>;
  className?: string;
}

/** Google Drive connection status and the Disconnect flow. */
export function ConnectionCard({ onDisconnected, className = '' }: ConnectionCardProps) {
  const ref = useRef<HTMLElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disconnect = async () => {
    setDisconnecting(true);
    setError(null);
    try {
      await api.disconnectGoogle();
      setConfirming(false);
      await onDisconnected();
    } catch (err) {
      setConfirming(false);
      setError(errorMessage(err, 'Couldn’t disconnect Google Drive'));
    } finally {
      setDisconnecting(false);
    }
  };

  useGSAP(
    () => {
      const alert = ref.current?.querySelector('.connection-alert');
      if (!alert) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(alert, { y: -8, autoAlpha: 0, duration: 0.3 });
        gsap.to(alert, { keyframes: { x: [0, -8, 7, -4, 0] }, duration: 0.45 });
      });
      return () => mm.revert();
    },
    { dependencies: [error], scope: ref, revertOnUpdate: true },
  );

  return (
    <section
      ref={ref}
      aria-labelledby="connection-heading"
      className={`flex flex-col rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8 ${className}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-periwinkle-soft" aria-hidden>
          <HardDrive className="h-5 w-5" />
        </span>
        <div>
          <h2 id="connection-heading" className="text-xl font-bold">
            Google Drive
          </h2>
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-sage-deep">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> Connected
          </p>
        </div>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-ink-soft">
        Disconnecting stops sorting, revokes DriveTag’s access at Google, and deletes the stored token. Your files and work
        processes stay exactly where they are.
      </p>

      {error && (
        <p
          role="alert"
          className="connection-alert mb-4 flex items-start gap-2 rounded-2xl border border-rose bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-ink"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-auto">
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)} disabled={disconnecting}>
          <Unplug className="h-4 w-4" aria-hidden /> Disconnect
        </Button>
      </div>

      {/* Portaled: the card's entrance transform would otherwise trap the fixed-position dialog inside it. */}
      {confirming &&
        createPortal(
          <ConfirmDialog
            open
            title="Disconnect Google Drive?"
            confirmLabel={disconnecting ? 'Disconnecting…' : 'Disconnect'}
            busy={disconnecting}
            onConfirm={() => void disconnect()}
            onCancel={() => setConfirming(false)}
          >
            DriveTag will stop sorting, revoke its access at Google, and delete the stored token. Nothing in your Drive is
            moved or deleted, and your work processes are kept. You can reconnect any time.
          </ConfirmDialog>,
          document.body,
        )}
    </section>
  );
}
