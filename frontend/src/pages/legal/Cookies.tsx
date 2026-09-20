import LegalPage, { LegalSection } from './LegalPage';

const TOC = [
  { id: 'overview', label: 'Overview' },
  { id: 'what-we-store', label: 'What we store, and why' },
  { id: 'what-we-dont-collect', label: "What we don't collect" },
  { id: 'changing-your-choice', label: 'Changing your choice' },
  { id: 'contact', label: 'Contact us' },
];

const STORAGE_ITEMS = [
  {
    name: 'sb-<project-ref>-auth-token',
    purpose: 'Keeps you signed in between visits (Supabase session)',
    type: 'Strictly necessary',
    duration: 'Until you sign out or the session expires',
  },
  {
    name: 'sb-<project-ref>-auth-token-code-verifier',
    purpose: 'One-time PKCE code verifier used only during Google sign-in',
    type: 'Strictly necessary',
    duration: 'Removed once sign-in completes',
  },
  {
    name: 'drivetag-analytics-consent-v1',
    purpose: 'Remembers your cookie/analytics choice',
    type: 'Strictly necessary',
    duration: 'Until you change your choice or clear browser storage',
  },
  {
    name: 'drivetag-beta-banner-v1',
    purpose: 'Remembers that you dismissed the closed-beta banner',
    type: 'Strictly necessary',
    duration: 'Until you clear browser storage',
  },
  {
    name: 'Vercel Web Analytics',
    purpose: 'Counts page views using a hash of the request, cookieless',
    type: 'Optional — analytics (only with consent)',
    duration: 'Discarded after 24 hours',
  },
];

export default function Cookies() {
  return (
    <LegalPage title="Cookie Policy" toc={TOC} contactEmail="privacy@drivetag-ai.com">
      <LegalSection id="overview" heading="Overview">
        <p>
          DriveTag sets no advertising or cross-site tracking cookies, and no third-party cookies. We use a small
          amount of strictly necessary browser storage to keep the app working, plus, only with your consent, one
          cookieless analytics tool. This page lists every item and why it's there.
        </p>
      </LegalSection>

      <LegalSection id="what-we-store" heading="What we store, and why">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-lavender-soft/60 text-ink">
                <th scope="col" className="px-4 py-3 font-bold">Name</th>
                <th scope="col" className="px-4 py-3 font-bold">Purpose</th>
                <th scope="col" className="px-4 py-3 font-bold">Type</th>
                <th scope="col" className="px-4 py-3 font-bold">Duration</th>
              </tr>
            </thead>
            <tbody>
              {STORAGE_ITEMS.map((item) => (
                <tr key={item.name} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-ink">{item.name}</td>
                  <td className="px-4 py-3">{item.purpose}</td>
                  <td className="px-4 py-3">{item.type}</td>
                  <td className="px-4 py-3">{item.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The Supabase items live in your browser's local storage, not as HTTP cookies, but we list them here for
          completeness since they serve the same purpose. Vercel Web Analytics, when you allow it, strips every URL
          query parameter except <span className="font-mono text-xs">utm_*</span> and the URL fragment before
          sending anything, because sign-in redirects can carry sensitive values in the URL.
        </p>
        <p>We self-host our fonts, so no font requests are sent to Google or any other third party.</p>
        <p>
          Checkout happens on Lemon Squeezy's own pages, which set their own cookies under their domain and are
          covered by <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noreferrer">Lemon Squeezy's own policy</a>, not this one. DriveTag itself sets no cookies for payments.
        </p>
      </LegalSection>

      <LegalSection id="what-we-dont-collect" heading="What we don't collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>No advertising or cross-site tracking cookies</li>
          <li>No fingerprinting</li>
          <li>No location data beyond the country-level figure Vercel Analytics derives, and only with consent</li>
          <li>No selling or renting of data collected through cookies or storage</li>
        </ul>
      </LegalSection>

      <LegalSection id="changing-your-choice" heading="Changing your choice">
        <p>
          You can change your analytics choice at any time using the "Cookie settings" button in the footer of every
          page.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="Contact us">
        <p>
          Questions about cookies or storage? Email{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:privacy@drivetag-ai.com">privacy@drivetag-ai.com</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
