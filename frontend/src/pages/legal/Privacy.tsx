import { Link } from 'react-router-dom';
import LegalPage, { LegalSection } from './LegalPage';

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'zero-retention', label: 'Zero-Retention' },
  { id: 'information-we-collect', label: 'Information we collect' },
  { id: 'what-we-dont-collect', label: "What we don't collect" },
  { id: 'google-user-data', label: 'Google user data' },
  { id: 'how-we-use-information', label: 'How we use information' },
  { id: 'legal-bases', label: 'Legal bases (EEA/UK)' },
  { id: 'service-providers', label: 'Service providers' },
  { id: 'international-transfers', label: 'International transfers' },
  { id: 'cookies-analytics', label: 'Cookies & analytics' },
  { id: 'data-retention', label: 'Data retention' },
  { id: 'security', label: 'Security' },
  { id: 'your-rights', label: 'Your rights' },
  { id: 'children', label: "Children's privacy" },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact us' },
];

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" toc={TOC} contactEmail="privacy@drivetag-ai.com">
      <LegalSection id="overview" heading="Overview">
        <p>
          DriveTag AI ("DriveTag", "we", "us") organizes visual assets and documents for creative agencies and
          freelancers by watching Google Drive folders you choose, classifying each new image or document with AI,
          and renaming and moving it automatically. This policy explains what information we collect to run that
          service, why, and what we deliberately don't collect.
        </p>
        <p>This policy covers drivetag-ai.com and the DriveTag AI application and API. It does not cover files you store in Google Drive, which Google's own privacy policy governs.</p>
      </LegalSection>

      <LegalSection id="who-we-are" heading="Who we are">
        <p>
          DriveTag AI is operated by <strong>DeltaCo Creatives</strong>, a business registered in Indonesia, at{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="https://drivetag-ai.com">
            drivetag-ai.com
          </a>{' '}
          (API at <span className="font-mono text-sm">api.drivetag-ai.com</span>). For anything about this policy,
          write to <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:privacy@drivetag-ai.com">privacy@drivetag-ai.com</a>.
        </p>
      </LegalSection>

      <LegalSection id="zero-retention" heading="Zero-Retention">
        <p>This is the core of how DriveTag handles your content, whether it's an image or a document — everything happens in server memory only, and nothing is written to disk, a database, or a storage bucket:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Images</strong> — downloaded into memory and sent to our AI provider inline, as part of the classification request itself, never uploaded to a file store, ours or the provider's.</li>
          <li><strong>PDFs</strong> — downloaded into memory and, if longer than 5 pages, trimmed in memory to their first 5 pages before being sent to our AI provider inline. Sending only those pages, not the file, keeps the rest of a long PDF out of the request entirely.</li>
          <li><strong>Word (.docx) and text, Markdown or CSV files</strong> — read into memory, with only the first roughly 12,000 characters of their text sent to our AI provider.</li>
          <li><strong>Google Docs, Sheets and Slides</strong> — exported by the Google Drive API as plain text or CSV into memory, with only the first roughly 12,000 characters sent to our AI provider.</li>
          <li>Once the file is renamed and moved in your Drive, whatever was read is discarded from memory. Files over 20 MB are skipped, and never downloaded, before this even starts.</li>
          <li>Google Docs, Sheets and Slides edited in the last 10 minutes are left alone until a later check — someone may still be writing them.</li>
        </ul>
        <p>
          Our AI provider, Google LLC, processes this content under its paid API terms: it does not use submitted
          content to train or improve its models, and it may retain request data for up to 55 days solely to detect
          and prevent abuse. We are telling you this plainly rather than claiming no one, anywhere, ever retains
          anything — that would not be accurate. See{' '}
          <a href="#google-user-data" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
            Google user data
          </a>{' '}
          below for the full picture of what DriveTag does with your Drive data.
        </p>
      </LegalSection>

      <LegalSection id="information-we-collect" heading="Information we collect">
        <p>We collect only what running the service requires:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Account identity</strong> — from Google sign-in via Supabase Auth: your name, email address, profile photo URL, and Google account id.</li>
          <li><strong>Google Drive access</strong> — an encrypted (AES-256-GCM) Drive refresh token, and the Drive watch-channel id and change-feed page token we use to detect new files.</li>
          <li><strong>Work process settings</strong> — the folder ids and names you choose, destination names and descriptions, your naming template, custom tag fields, AI instructions, and time zone.</li>
          <li>
            <strong>Activity ledger</strong> — for each file DriveTag processes: the Drive file id, original file name, new file name, whether it's an image or a document, the AI's classification fields (subject, style and genre for images; document type, topic, the organization or person it's from or for, and the date shown on the document for documents), any custom field values, the destination it was sorted to, its status, any error message, and timestamps. We keep this so you can see your sorting history in the dashboard, and so a file is never sorted twice. The organization/person field and custom fields can contain names taken from the text of your documents — this is personal data, and we keep it for the life of your account, the same as the rest of this ledger, and delete it when you delete your account.
          </li>
          <li><strong>Plan and usage</strong> — your plan, subscription status, image and document usage counters, and (once payments exist) purchase references for credit top-ups.</li>
          <li>
            <strong>Beta sign-up</strong> — if you request access to our closed beta, we store your name, email, what
            you do, roughly how many files a week, and the time you gave consent. We use it to invite you to the beta
            and add you to the tester list in our Google Cloud project, and keep it until the beta ends or you ask us
            to delete it — see <Link to="/data-deletion" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Data deletion</Link>.
            A sign-up isn't tied to a DriveTag account, since you can request access before creating one.
          </li>
          <li><strong>Browser storage</strong> — your Supabase sign-in session and your cookie/analytics choice, both in your browser's local storage. See our{' '}
            <Link to="/cookies" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Cookie Policy</Link> for details.
          </li>
          <li><strong>Server logs</strong> — structured logs that automatically redact token, secret and key fields. They contain user ids, Drive file ids, error messages and timestamps, and are kept briefly by our hosting provider for security and debugging.</li>
        </ul>
      </LegalSection>

      <LegalSection id="what-we-dont-collect" heading="What we don't collect">
        <p>We built DriveTag to need as little of your data as possible. We deliberately do not collect or keep:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Copies of your images or documents, or the text extracted from them</li>
          <li>Passwords — sign-in is Google only, so we never see or store one</li>
          <li>Payment card data</li>
          <li>Advertising trackers, fingerprinting scripts, or cross-site tracking</li>
          <li>Your precise location — only the country-level figure our analytics provider derives, and only if you've consented to analytics</li>
        </ul>
        <p>We also do not sell or rent your data to anyone, and we do not use your content to train AI models.</p>
      </LegalSection>

      <LegalSection id="google-user-data" heading="Google user data">
        <p>
          DriveTag requests the full <span className="font-mono text-sm">https://www.googleapis.com/auth/drive</span>{' '}
          scope, not the narrower <span className="font-mono text-sm">drive.file</span> scope, because it must read,
          rename and move files that <em>other people</em> add to your Raw folders — files a per-file grant would
          never let us see.
        </p>
        <p>With that access, here is exactly what DriveTag does and doesn't do:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>It reads folder names when you browse Drive to pick a Raw, Master or destination folder.</li>
          <li>It reads your Drive changes feed, pulling only enough file metadata to tell whether a changed file is an image or document inside one of your Raw folders. Everything else in the feed is ignored and never stored.</li>
          <li>It reads the bytes or text of images and documents inside your Raw folders, in memory only, as described under Zero-Retention above.</li>
          <li>It creates folders when you ask it to.</li>
          <li>It never deletes files.</li>
        </ul>
        <p>We don't use Google user data for advertising, we don't sell it, and we don't use it to train or improve AI models. Humans at DriveTag don't read your Google user data except with your permission for support, for security investigations, or where the law requires it.</p>
        <p>You can revoke DriveTag's access to your Google account at any time at{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            myaccount.google.com/permissions
          </a>.
        </p>
        <p className="rounded-2xl border border-line bg-lavender-soft/60 p-4 text-sm text-ink">
          DriveTag AI's use and transfer of information received from Google APIs to any other app will adhere to
          the{' '}
          <a
            className="font-semibold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </LegalSection>

      <LegalSection id="how-we-use-information" heading="How we use information">
        <ul className="list-disc space-y-2 pl-5">
          <li>To run the core service: detect new images and documents, classify them, and rename/move them per your settings.</li>
          <li>To operate your account: authentication, plan limits, usage metering, and support.</li>
          <li>To show you your sorting history and current usage in the dashboard.</li>
          <li>To keep the service secure and reliable, and to debug problems.</li>
          <li>With your consent, to measure site usage through privacy-preserving analytics (see{' '}
            <a href="#cookies-analytics" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Cookies &amp; analytics</a>).
          </li>
          <li>To meet legal obligations, such as responding to a lawful request.</li>
        </ul>
      </LegalSection>

      <LegalSection id="legal-bases" heading="Legal bases (EEA/UK)">
        <p>If you're in the EEA or UK, we process your data under these legal bases:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Contract</strong> — to provide the service you signed up for.</li>
          <li><strong>Legitimate interests</strong> — for security and debugging.</li>
          <li><strong>Consent</strong> — for optional analytics, which you can withdraw at any time.</li>
        </ul>
      </LegalSection>

      <LegalSection id="service-providers" heading="Service providers">
        <p>We share data only with the providers that help us run DriveTag, each bound to protect it:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Supabase</strong> — our database and authentication provider.</li>
          <li><strong>DigitalOcean</strong> — hosts our backend.</li>
          <li><strong>Vercel</strong> — hosts our website and, only with your consent, provides cookieless Web Analytics.</li>
          <li><strong>Google LLC</strong> — Google sign-in, the Google Drive API, and AI processing (Google's generative AI API).</li>
          <li><strong>Namecheap</strong> — our domain and email forwarding for our support addresses.</li>
          <li>
            <strong>Lemon Squeezy</strong> (Sold through Link, LLC, formerly Lemon Squeezy LLC, a Utah limited
            liability company) — our Merchant of Record for paid plans and packs, once checkout opens. It receives your name,
            email, billing address and country, and processes your card details itself — DriveTag never sees them —
            to handle payment, invoicing, and sales-tax/VAT collection and remittance. See{' '}
            <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noreferrer">Lemon Squeezy's Privacy Policy</a>.
          </li>
        </ul>
        <p>
          Checkout itself is not live yet — see our <Link to="/plans" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">pricing page</Link>. Once it opens, buying a plan or pack means Lemon Squeezy sells it to you as Merchant of Record, as described in our{' '}
          <Link to="/terms" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Terms of Service</Link>.
        </p>
        <p>We never sell or rent your personal information to anyone.</p>
      </LegalSection>

      <LegalSection id="international-transfers" heading="International transfers">
        <p>
          Our service providers may process data outside your country, including in the United States. Where that
          happens, we rely on safeguards such as our providers' standard contractual clauses to protect your
          information.
        </p>
      </LegalSection>

      <LegalSection id="cookies-analytics" heading="Cookies & analytics">
        <p>
          DriveTag sets no advertising or cross-site tracking cookies, and no third-party cookies. We use strictly
          necessary browser storage to keep you signed in, plus, only if you agree, cookieless analytics that counts
          page views without identifying you. Full details, including exact storage keys and how to change your
          choice, are in our <Link to="/cookies" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Cookie Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="data-retention" heading="Data retention">
        <ul className="list-disc space-y-2 pl-5">
          <li>Account data is kept until you delete your account.</li>
          <li>Your activity ledger (sorting history) is kept for the life of your account.</li>
          <li>When you delete your account, everything is removed from our live database immediately, and our providers' backups roll off within 30 days.</li>
          <li>Server logs are short-lived.</li>
        </ul>
      </LegalSection>

      <LegalSection id="security" heading="Security">
        <ul className="list-disc space-y-2 pl-5">
          <li>All traffic to DriveTag runs over TLS.</li>
          <li>Your Google Drive refresh token is encrypted at rest with AES-256-GCM.</li>
          <li>Our database uses row-level security, and only our backend holds the service key that can bypass it.</li>
          <li>We follow least-privilege access internally.</li>
        </ul>
        <p>If a security incident affects your data, we will notify you as required by applicable law.</p>
      </LegalSection>

      <LegalSection id="your-rights" heading="Your rights">
        <p>Depending on where you live, you may have the right to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Access the personal data we hold about you</li>
          <li>Correct inaccurate data</li>
          <li>Delete your data (see our <Link to="/data-deletion" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">Data deletion</Link> page)</li>
          <li>Receive your data in a portable format</li>
          <li>Object to, or ask us to restrict, certain processing</li>
          <li>Withdraw consent at any time, for anything based on consent</li>
          <li>Lodge a complaint with a supervisory authority — an EU/EEA data protection authority, the UK Information Commissioner's Office, or, in Indonesia, under Law No. 27 of 2022 on Personal Data Protection</li>
        </ul>
        <p>
          To exercise any of these, email <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:privacy@drivetag-ai.com">privacy@drivetag-ai.com</a>.
        </p>
        <p>
          <strong>California residents:</strong> we don't sell or share your personal information for cross-context
          behavioral advertising, so there is nothing to opt out of under the CCPA/CPRA.
        </p>
      </LegalSection>

      <LegalSection id="children" heading="Children's privacy">
        <p>DriveTag is a business tool and is not directed to anyone under 18. We do not knowingly collect data from children.</p>
      </LegalSection>

      <LegalSection id="changes" heading="Changes to this policy">
        <p>
          If we make a material change to this policy, we'll announce it on the site and, where appropriate, by
          email, and update the "Last updated" date above.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="Contact us">
        <p>
          For privacy questions, data requests, or deletion, email{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:privacy@drivetag-ai.com">privacy@drivetag-ai.com</a>. For
          everything else, email{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:support@drivetag-ai.com">support@drivetag-ai.com</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
