import { Link } from 'react-router-dom';
import LegalPage, { LegalSection } from './LegalPage';

const TOC = [
  { id: 'not-live-yet', label: 'Checkout is not live yet' },
  { id: 'new-subscriptions', label: 'New subscriptions' },
  { id: 'renewals', label: 'Forgot to cancel a renewal' },
  { id: 'topup-packs', label: 'Image & document packs' },
  { id: 'yearly-plans', label: 'Yearly plans' },
  { id: 'cancelling', label: 'Cancelling' },
  { id: 'eu-uk-consumers', label: 'EU/UK consumers' },
  { id: 'failed-files', label: 'Failed files' },
  { id: 'how-to-request', label: 'How to request a refund' },
  { id: 'contact', label: 'Contact us' },
];

export default function Refunds() {
  return (
    <LegalPage title="Refund Policy" toc={TOC} contactEmail="support@drivetag-ai.com">
      <LegalSection id="not-live-yet" heading="Checkout is not live yet">
        <p>
          Paid plans and checkout aren't live on DriveTag yet — see our{' '}
          <Link to="/plans" className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">pricing page</Link>. This Refund Policy
          describes how refunds will work once they are, so you know what to expect before you ever pay us. Purchases
          will be made through Lemon Squeezy, our Merchant of Record, so refunds are issued through them too.
        </p>
      </LegalSection>

      <LegalSection id="new-subscriptions" heading="New subscriptions">
        <p>
          Ask within <strong>14 days</strong> of your first payment on a new subscription and we'll refund it in
          full, no questions asked.
        </p>
      </LegalSection>

      <LegalSection id="renewals" heading="Forgot to cancel a renewal">
        <p>
          If a subscription renews and you meant to cancel it, ask within <strong>7 days</strong> of the renewal
          charge and we'll refund it — as long as nothing was sorted since it renewed.
        </p>
      </LegalSection>

      <LegalSection id="topup-packs" heading="Image & document packs">
        <p>Unused one-time image or document packs are refundable within <strong>14 days</strong> of purchase.</p>
      </LegalSection>

      <LegalSection id="yearly-plans" heading="Yearly plans">
        <p>
          Yearly plans are fully refundable within <strong>14 days</strong> of purchase. After that, you can cancel
          anytime to stop the next renewal — we don't offer partial refunds for the remainder of a yearly term.
        </p>
      </LegalSection>

      <LegalSection id="cancelling" heading="Cancelling">
        <p>
          Cancelling a subscription stops future renewals. You keep access to your plan until the end of the period
          you already paid for.
        </p>
      </LegalSection>

      <LegalSection id="eu-uk-consumers" heading="EU/UK consumers">
        <p>
          If you're a consumer in the EU or UK, you also keep your statutory 14-day right of withdrawal, on top of
          the policy above.
        </p>
      </LegalSection>

      <LegalSection id="failed-files" heading="Failed files">
        <p>
          Files DriveTag fails to sort are never charged against your allowance in the first place, so there's
          nothing to refund for them.
        </p>
      </LegalSection>

      <LegalSection id="how-to-request" heading="How to request a refund">
        <p>
          Email <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:support@drivetag-ai.com">support@drivetag-ai.com</a>{' '}
          from your account's email address, and tell us what you'd like refunded. Approved refunds go back to your
          original payment method through Lemon Squeezy, our Merchant of Record, typically within 5–10 business days.
          Prices exclude VAT and sales tax, and any tax you were charged is refunded along with the purchase price.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="Contact us">
        <p>
          Questions about a charge or refund? Email{' '}
          <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href="mailto:support@drivetag-ai.com">support@drivetag-ai.com</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
