import { Link } from 'react-router-dom';
import LegalPage, { LegalSection } from './LegalPage';

const TOC = [
  { id: 'in-app', label: 'Delete in the app' },
  { id: 'by-email', label: 'Delete by email' },
  { id: 'revoking-google-access', label: 'Revoking Google access separately' },
  { id: 'what-happens-next', label: 'What happens next' },
  { id: 'contact', label: 'Contact us' },
];

export default function DataDeletion() {
  return (
    <LegalPage title="Data Deletion" toc={TOC} contactEmail="privacy@drivetag-ai.com">
      <LegalSection id="in-app" heading="Delete in the app">
        <p>
          Go to <strong>Dashboard → Account → Delete account</strong>. This stops DriveTag from sorting your files,
          revokes DriveTag's Drive access at Google, and permanently deletes all of your DriveTag data. Files
          already in your Google Drive are never touched or deleted — DriveTag only removes what it stored about
          your account.
        </p>
      </LegalSection>

      <LegalSection id="by-email" heading="Delete by email">
        <p>
          Prefer email? Write to{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:privacy@drivetag-ai.com">privacy@drivetag-ai.com</a>{' '}
          from your account's email address and ask us to delete your account. We'll confirm and complete the
          deletion within 30 days — usually much sooner.
        </p>
      </LegalSection>

      <LegalSection id="revoking-google-access" heading="Revoking Google access separately">
        <p>
          You can revoke DriveTag's access to your Google account directly at any time, without deleting your
          DriveTag account, at{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>. Note that this stops sorting but doesn't delete your DriveTag data — use the steps above for that.
        </p>
      </LegalSection>

      <LegalSection id="what-happens-next" heading="What happens next">
        <ul className="list-disc space-y-2 pl-5">
          <li>Everything is removed from our live database immediately.</li>
          <li>Our providers' backups roll off within 30 days.</li>
          <li>Your files in Google Drive are unaffected — DriveTag never deletes them.</li>
        </ul>
        <p>
          For the full picture of what we store and why, see our{' '}
          <Link to="/privacy" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="Contact us">
        <p>
          Questions about deleting your data? Email{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:privacy@drivetag-ai.com">privacy@drivetag-ai.com</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
