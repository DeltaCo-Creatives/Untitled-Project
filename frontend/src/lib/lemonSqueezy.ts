/**
 * Lazily loads Lemon Squeezy's checkout overlay (`lemon.js`) so a buy button can open payment without
 * leaving the page. Never imported eagerly and never invoked on page load or for a signed-out visitor —
 * callers (PlanCard, TopupPacks) load it only from inside a buy-button click handler.
 *
 * A buyer must never be left stuck: if the script fails to load, or doesn't expose its API within a short
 * timeout, `openCheckout` falls back to a plain redirect.
 */

interface LemonSqueezyEvent {
  event?: string;
}

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Url: { Open: (url: string) => void; Close?: () => void };
      Setup?: (options: { eventHandler: (event: LemonSqueezyEvent) => void }) => void;
    };
  }
}

/** Where a completed purchase lands. The page confirms from GET /api/me — never from this URL. */
const SUCCESS_PATH = '/checkout/success';

const SCRIPT_URL = 'https://assets.lemonsqueezy.com/lemon.js';
const READY_TIMEOUT_MS = 4000;

// Cached across calls so the script is fetched and initialized at most once per page load.
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.LemonSqueezy) {
    registerSuccessHandler();
    return Promise.resolve();
  }
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        // The script's own bootstrap: sets up window.LemonSqueezy and its Url.Open/Close helpers.
        window.createLemonSqueezy?.();
        registerSuccessHandler();
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load the Lemon Squeezy checkout script'));
      document.head.appendChild(script);
    }).catch((err: unknown) => {
      // Let a later click retry instead of remembering this page load as permanently broken.
      scriptPromise = null;
      throw err;
    });
  }
  return scriptPromise;
}

/**
 * Lemon Squeezy fires `Checkout.Success` in the overlay the moment a purchase completes. Without this the
 * buyer would have to notice and click the confirmation modal's button to come back, and anyone who closed
 * the overlay instead would never see their receipt at all. Best-effort: if the API isn't there, the
 * confirmation modal's button link (set per product during setup) is still the way back.
 */
function registerSuccessHandler(): void {
  try {
    window.LemonSqueezy?.Setup?.({
      eventHandler: (event) => {
        if (event?.event !== 'Checkout.Success') return;
        try {
          window.LemonSqueezy?.Url?.Close?.();
        } catch {
          // Closing is a courtesy; navigating away removes the overlay regardless.
        }
        window.location.assign(SUCCESS_PATH);
      },
    });
  } catch {
    // Never let a failure here stop the checkout itself from opening.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Lemon Squeezy')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** Opens `url` in the Lemon Squeezy overlay, or redirects the page there if the overlay can't be readied in time. */
export async function openCheckout(url: string): Promise<void> {
  try {
    await withTimeout(loadScript(), READY_TIMEOUT_MS);
    if (!window.LemonSqueezy?.Url?.Open) throw new Error('Lemon Squeezy script loaded without exposing its API');
    window.LemonSqueezy.Url.Open(url);
  } catch {
    window.location.assign(url);
  }
}

const PENDING_KEY = 'drivetag-pending-checkout';

/**
 * Records which plan or pack the buyer just left to pay for, so `/checkout/success` can confirm the
 * purchase by matching it rather than by diffing before/after snapshots. The webhook is a
 * server-to-server call that often lands before the browser gets back, which makes a diff unreliable.
 *
 * sessionStorage, not localStorage: it is scoped to this tab and this browsing session, which is
 * exactly the lifetime of one checkout. Every access is wrapped — storage throws in private mode and
 * when site data is blocked, and a failure here must never stop someone buying.
 */
export function rememberPendingCheckout(item: string): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, item);
  } catch {
    // Not available: /checkout/success falls back to before/after comparison.
  }
}

/** The item id recorded before checkout, or null. */
export function readPendingCheckout(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

/** Called once the purchase is confirmed, so a later visit can't re-confirm against a stale item. */
export function clearPendingCheckout(): void {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clean up if storage was never available.
  }
}
