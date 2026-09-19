// Analytics consent. Only Vercel Web Analytics (cookieless, hashed, 24h) depends on it; everything
// else the site stores (the Supabase session, this choice itself) is strictly necessary.
// Storage can throw (private mode, blocked site data), so a failed read means "not decided yet".

export type ConsentChoice = 'granted' | 'denied';

const STORAGE_KEY = 'drivetag-analytics-consent-v1';
/** Fired on window after the choice changes; detail is the new ConsentChoice. */
export const CONSENT_CHANGED_EVENT = 'drivetag:consent-changed';
/** Fired on window to reopen the cookie banner (footer "Cookie settings" link). */
export const OPEN_COOKIE_SETTINGS_EVENT = 'drivetag:open-cookie-settings';

export function getAnalyticsConsent(): ConsentChoice | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function setAnalyticsConsent(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Still applies for this page view; the banner simply asks again next visit.
  }
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_CHANGED_EVENT, { detail: choice }));
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
