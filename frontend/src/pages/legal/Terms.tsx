import { Link } from 'react-router-dom';
import LegalPage, { LegalSection } from './LegalPage';

const TOC = [
  { id: 'acceptance', label: 'Acceptance of terms' },
  { id: 'the-service', label: 'The service' },
  { id: 'eligibility', label: 'Eligibility' },
  { id: 'accounts', label: 'Accounts & Google sign-in' },
  { id: 'your-content', label: 'Google Drive access & your content' },
  { id: 'ai-output', label: 'AI output' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'plans-billing', label: 'Plans, allowances & billing' },
  { id: 'free-plan', label: 'Free plan' },
  { id: 'suspension-termination', label: 'Suspension & termination' },
  { id: 'third-party-services', label: 'Third-party services' },
  { id: 'disclaimers', label: 'Disclaimers' },
  { id: 'limitation-of-liability', label: 'Limitation of liability' },
  { id: 'indemnification', label: 'Indemnification' },
  { id: 'governing-law', label: 'Governing law & disputes' },
  { id: 'changes-to-terms', label: 'Changes to these terms' },
  { id: 'contact', label: 'Contact us' },
];

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" toc={TOC} contactEmail="support@drivetag-ai.com">
      <LegalSection id="acceptance" heading="Acceptance of terms">
        <p>
          These Terms of Service ("Terms") are an agreement between you and{' '}
          <strong>DeltaCo Creatives</strong>, a business registered in Indonesia, operating DriveTag AI at{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="https://drivetag-ai.com">drivetag-ai.com</a> ("DriveTag", "we", "us"). By
          creating an account or using DriveTag, you agree to these Terms. If you don't agree, don't use the service.
        </p>
      </LegalSection>

      <LegalSection id="the-service" heading="The service">
        <p>
          DriveTag watches Google Drive "Raw" folders you choose, classifies each new file with AI, and renames and
          moves it into a destination folder based on the AI's tags. You configure this as one or more "AI work
          processes," each with its own Raw and Master folders, destination folders, naming template, custom tag
          fields, and instructions. A process is fixed, when you create it, to sort either images or documents — PDFs,
          Word (.docx) files, Google Docs, Sheets and Slides, and text, Markdown or CSV files — never both.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" heading="Eligibility">
        <ul className="list-disc space-y-2 pl-5">
          <li>You must be at least 18 years old.</li>
          <li>DriveTag is for business and professional use.</li>
          <li>If you're using DriveTag on behalf of a company or other organization, you confirm you have the authority to bind that organization to these Terms.</li>
        </ul>
      </LegalSection>

      <LegalSection id="accounts" heading="Accounts & Google sign-in">
        <p>
          You sign in to DriveTag with your Google account. You're responsible for activity that happens under your
          account and for keeping your Google account secure. Connecting Google Drive to DriveTag is a separate step
          from signing in, and grants DriveTag ongoing access to process files in your Drive as described in our{' '}
          <Link to="/privacy" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="your-content" heading="Google Drive access & your content">
        <p>You own the files in your Google Drive. By connecting Drive and setting up a work process, you:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Grant DeltaCo Creatives a limited license to access, read, rename and move those files solely to provide the service to you.</li>
          <li>Confirm that you have the rights needed to have DriveTag process the files in your Raw folders — including files that other people add to a shared Raw folder.</li>
        </ul>
        <p>We never sell your content, and we don't use it to train AI models. See our <Link to="/privacy" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Privacy Policy</Link> for what we access and why.</p>
      </LegalSection>

      <LegalSection id="ai-output" heading="AI output">
        <ul className="list-disc space-y-2 pl-5">
          <li>Classification, tagging and destination choices are automated and can be wrong or incomplete.</li>
          <li>For a long document, the AI reads only the beginning — the first 5 pages of a PDF, or roughly the first 12,000 characters of a Word, text, or Google Docs/Sheets/Slides file — so classification is based on that part, not the whole document.</li>
          <li>DriveTag renames and moves files — it never deletes them.</li>
          <li>Review results that matter before relying on them.</li>
          <li>Google Drive's own version history and folder structure remain yours to use if you need to undo something.</li>
        </ul>
      </LegalSection>

      <LegalSection id="acceptable-use" heading="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Use DriveTag for anything unlawful, or upload malware.</li>
          <li>Abuse, overload, or attempt to disrupt the service.</li>
          <li>Reverse engineer, decompile, or attempt to extract the source code of DriveTag.</li>
          <li>Circumvent plan limits, usage metering, or security controls.</li>
          <li>Resell or white-label DriveTag without our written permission.</li>
        </ul>
      </LegalSection>

      <LegalSection id="plans-billing" heading="Plans, allowances & billing">
        <ul className="list-disc space-y-2 pl-5">
          <li>Each plan's process limits, AI-worker limits, and image and document allowances are shown on our{' '}
            <Link to="/plans" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">pricing page</Link>, across our Images, Documents, and Images + Documents plan families. Any plan can run either kind of work process.
          </li>
          <li>When an allowance runs out, sorting pauses until it resets or you add an image or document pack — we never charge overage fees.</li>
          <li>Prices are listed in USD; taxes are calculated at checkout.</li>
          <li>Paid subscriptions renew automatically until cancelled.</li>
          <li>We'll announce price changes at least 30 days before they take effect.</li>
          <li>Once checkout is live, payments will be handled by a Merchant of Record on our behalf.</li>
          <li>Refunds are governed by our <Link to="/refunds" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Refund Policy</Link>.</li>
        </ul>
      </LegalSection>

      <LegalSection id="free-plan" heading="Free plan">
        <p>The Free plan's image and document allowances and limits may change with notice, as described on our pricing page.</p>
      </LegalSection>

      <LegalSection id="suspension-termination" heading="Suspension & termination">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            You can stop using DriveTag and delete your account at any time. Your sorting history stays visible in
            the dashboard until you do; for a copy of the data we hold about you, email{' '}
            <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:privacy@drivetag-ai.com">privacy@drivetag-ai.com</a>.
            Deleting your account works as described on our{' '}
            <Link to="/data-deletion" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Data deletion</Link> page.
          </li>
          <li>
            We may suspend or close an account that breaks these Terms or puts the service or other people at risk,
            and we'll tell you why unless the law or a security risk prevents it.
          </li>
          <li>
            If we discontinue DriveTag for any other reason, we'll give at least 30 days' notice and refund any
            prepaid period you can no longer use.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="third-party-services" heading="Third-party services">
        <p>
          DriveTag relies on Google for sign-in and Drive access. Your use of those features is also subject to
          Google's own terms of service.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" heading="Disclaimers">
        <p>
          DriveTag is provided "as is" and "as available," to the fullest extent permitted by law. We don't
          guarantee the service will be uninterrupted, error-free, or that AI classification will always be
          accurate.
        </p>
      </LegalSection>

      <LegalSection id="limitation-of-liability" heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, DeltaCo Creatives' total liability arising out of or relating to
          DriveTag is limited to the fees you paid in the 12 months before the claim, or USD 100 if you paid us
          nothing. We are not liable for indirect, incidental, or consequential damages. Nothing in these Terms
          limits liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection id="indemnification" heading="Indemnification">
        <p>
          If you use DriveTag for business purposes, you agree to indemnify and hold DeltaCo Creatives harmless from
          claims arising from your content, your use of the service, or your violation of these Terms.
        </p>
      </LegalSection>

      <LegalSection id="governing-law" heading="Governing law & disputes">
        <p>
          These Terms are governed by the laws of the Republic of Indonesia. Disputes will be resolved in the courts
          of Indonesia, without affecting any mandatory consumer protections you're entitled to under the laws of
          your own country.
        </p>
      </LegalSection>

      <LegalSection id="changes-to-terms" heading="Changes to these terms">
        <p>
          We may update these Terms from time to time. Material changes will be announced on the site and, where
          appropriate, by email, with the "Last updated" date above reflecting the latest version.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="Contact us">
        <p>
          Questions about these Terms? Email{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:support@drivetag-ai.com">support@drivetag-ai.com</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
