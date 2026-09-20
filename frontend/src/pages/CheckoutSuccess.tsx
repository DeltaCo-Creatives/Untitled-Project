import { useEffect, useRef, useState } from 'react';
import { Clock3, RefreshCw } from 'lucide-react';
import { api, type MeResponse, type PlansResponse } from '../lib/api';
import { clearPendingCheckout, readPendingCheckout } from '../lib/lemonSqueezy';
import { usePlans } from '../hooks/usePlans';
import { errorMessage } from '../lib/messages';
import { formatCount } from '../lib/format';
import { formatPrice } from '../components/billing/planFeatures';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button, ButtonLink } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { ReceiptPrint, type ReceiptLine } from '../components/billing/ReceiptPrint';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30_000;
const SUPPORT_EMAIL = 'support@drivetag-ai.com';

type Phase = 'confirming' | 'confirmed' | 'timeout';

interface Receipt {
  title: string;
  lines: ReceiptLine[];
  total: string;
  note?: string;
}

/**
 * What actually changed between the first `/api/me` read (taken right after landing here) and the latest one.
 * A plan id change is compared against that baseline, not against the literal string "free" — an already-paying
 * customer topping up credits must never be declared "confirmed" just because their plan was never free to begin
 * with. Money is involved: it's safer to under-detect for a beat than to print a receipt for nothing.
 */
function purchaseDelta(baseline: MeResponse, current: MeResponse) {
  const planChanged = Boolean(current.plan && baseline.plan?.id !== current.plan.id);
  const imagesDelta = (current.usage?.images.topupBalance ?? 0) - (baseline.usage?.images.topupBalance ?? 0);
  const documentsDelta = (current.usage?.documents.topupBalance ?? 0) - (baseline.usage?.documents.topupBalance ?? 0);
  return { planChanged, imagesDelta, documentsDelta };
}

/** Builds the receipt's props from confirmed API data only — never from the redirect's query string. */
function buildReceipt(baseline: MeResponse, current: MeResponse, plans: PlansResponse | null, planConfirmed = false): Receipt {
  const currency = plans?.currency ?? 'USD';
  const pricesIncludeTax = plans?.pricesIncludeTax ?? false;
  const taxLabel = pricesIncludeTax ? 'Tax' : 'VAT/sales tax';
  const taxValue = pricesIncludeTax ? 'Included' : 'Added by Lemon Squeezy';
  const note = pricesIncludeTax ? undefined : 'Excludes VAT/sales tax — added by Lemon Squeezy at checkout.';
  const { planChanged, imagesDelta, documentsDelta } = purchaseDelta(baseline, current);

  if ((planChanged || planConfirmed) && current.plan) {
    const planInfo = plans?.plans.find((plan) => plan.id === current.plan?.id) ?? null;
    const subtotal = planInfo ? formatPrice(planInfo.price.monthly, currency) : null;
    const lines: ReceiptLine[] = [{ label: 'Billing period', value: 'Monthly' }];
    if (subtotal) lines.push({ label: 'Subtotal', value: subtotal });
    lines.push({ label: taxLabel, value: taxValue });
    return { title: current.plan.label, lines, total: subtotal ?? '—', note };
  }

  const lines: ReceiptLine[] = [];
  let subtotal = 0;
  let matched = false;
  if (imagesDelta > 0) {
    lines.push({ label: 'Images added', value: formatCount(imagesDelta) });
    const pack = plans?.topupPacks.find((p) => p.images === imagesDelta);
    if (pack) {
      subtotal += pack.price;
      matched = true;
    }
  }
  if (documentsDelta > 0) {
    lines.push({ label: 'Documents added', value: formatCount(documentsDelta) });
    const pack = plans?.documentPacks.find((p) => p.documents === documentsDelta);
    if (pack) {
      subtotal += pack.price;
      matched = true;
    }
  }
  if (matched) lines.push({ label: 'Subtotal', value: formatPrice(subtotal, currency) });
  lines.push({ label: taxLabel, value: taxValue });
  const title = imagesDelta > 0 && documentsDelta > 0 ? 'Credit packs' : documentsDelta > 0 ? 'Document pack' : 'Image pack';
  return { title, lines, total: matched ? formatPrice(subtotal, currency) : 'See your Lemon Squeezy receipt', note };
}

export default function CheckoutSuccess() {
  useDocumentTitle('Payment confirmed');
  const { plans } = usePlans();

  // Internal polling bookkeeping only — never read during render, so mutating them can't desync the UI.
  const baseline = useRef<MeResponse | null>(null);
  const startedAt = useRef<number | null>(null);

  // What the buyer actually chose, recorded before they left for Lemon Squeezy. Read once: it is only
  // used to recognise the purchase, never to display anything, so a tampered value can at worst delay
  // confirmation — it can never put a number or a plan name on the receipt.
  const [pendingItem] = useState<string | null>(() => readPendingCheckout());
  const expectedPlanId = pendingItem && plans?.plans.some((plan) => plan.id === pendingItem) ? pendingItem : null;

  const [phase, setPhase] = useState<Phase>('confirming');
  const [generation, setGeneration] = useState(0);
  const [pollError, setPollError] = useState<string | null>(null);
  // The one snapshot the receipt is built from, captured exactly once at the moment a change is detected.
  const [purchase, setPurchase] = useState<{ baseline: MeResponse; current: MeResponse; planConfirmed: boolean } | null>(null);

  useEffect(() => {
    if (phase !== 'confirming') return undefined;
    if (startedAt.current === null) startedAt.current = Date.now();
    let active = true;

    async function poll() {
      try {
        const me = await api.me();
        if (!active) return;
        setPollError(null);
        // Checked BEFORE the baseline is taken, and on every poll. The webhook is a server-to-server
        // call that routinely beats the browser's redirect back here, so the very first /api/me read
        // can already contain the purchase — in which case every later delta is zero and a
        // baseline-only check would leave a paying customer on "confirming" forever. Matching the
        // plan the buyer actually chose is exact and needs no before-state at all.
        if (expectedPlanId && me.plan?.id === expectedPlanId) {
          setPurchase({ baseline: baseline.current ?? me, current: me, planConfirmed: true });
          setPhase('confirmed');
          return;
        }
        if (!baseline.current) {
          baseline.current = me;
          return;
        }
        const { planChanged, imagesDelta, documentsDelta } = purchaseDelta(baseline.current, me);
        if (planChanged || imagesDelta > 0 || documentsDelta > 0) {
          setPurchase({ baseline: baseline.current, current: me, planConfirmed: false });
          setPhase('confirmed');
          return;
        }
        if (startedAt.current !== null && Date.now() - startedAt.current >= POLL_TIMEOUT_MS) {
          setPhase('timeout');
        }
      } catch (err) {
        if (active) setPollError(errorMessage(err, 'Couldn’t check your account.'));
      }
    }

    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [phase, generation, expectedPlanId]);

  const checkAgain = () => {
    // Keep the original baseline so a webhook that lands after the first timeout still gets detected as a change.
    startedAt.current = Date.now();
    setPollError(null);
    setPhase('confirming');
    setGeneration((n) => n + 1);
  };

  useEffect(() => {
    if (phase === 'confirmed') clearPendingCheckout();
  }, [phase]);

  const receipt = purchase ? buildReceipt(purchase.baseline, purchase.current, plans, purchase.planConfirmed) : null;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <Logo />
      </div>
      <main id="main-content" className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
        {phase === 'confirming' && (
          <div className="w-full rounded-[2rem] border border-line bg-white p-8 shadow-lift sm:p-10">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-lavender-soft" aria-hidden>
              <RefreshCw className="h-8 w-8 animate-spin text-lavender-deep motion-reduce:animate-none" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">Payment received</h1>
            <p role="status" aria-live="polite" className="leading-relaxed text-ink-soft">
              We’re confirming it with Lemon Squeezy. This usually only takes a few seconds.
            </p>
            <p aria-live="polite" className={pollError ? 'mt-3 text-sm font-semibold text-rose-ink' : 'sr-only'}>
              {pollError}
            </p>
          </div>
        )}

        {phase === 'timeout' && (
          <div className="w-full rounded-[2rem] border border-line bg-white p-8 shadow-lift sm:p-10">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-butter-soft" aria-hidden>
              <Clock3 className="h-8 w-8 text-ink" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">Still confirming your payment</h1>
            <p role="status" className="mb-6 leading-relaxed text-ink-soft">
              Your payment may still be processing — it isn’t lost. Your plan and credits update automatically as
              soon as Lemon Squeezy confirms it, so there’s nothing you need to do. If this doesn’t clear up soon,
              email{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-bold text-ink underline underline-offset-2 hover:text-ink-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button onClick={checkAgain}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Check again
              </Button>
              <ButtonLink to="/dashboard" variant="secondary">
                Back to dashboard
              </ButtonLink>
            </div>
          </div>
        )}

        {phase === 'confirmed' && receipt && (
          <div className="flex w-full flex-col items-center gap-6">
            <ReceiptPrint title={receipt.title} lines={receipt.lines} total={receipt.total} note={receipt.note} />
            <p role="status" aria-live="polite" className="text-sm font-semibold text-sage-deep">
              Payment confirmed — thanks!
            </p>
            <ButtonLink to="/dashboard" variant="secondary">
              Back to dashboard
            </ButtonLink>
          </div>
        )}
      </main>
    </div>
  );
}
