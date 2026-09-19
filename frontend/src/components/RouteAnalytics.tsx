import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import { CookieConsent } from './CookieConsent';
import { CONSENT_CHANGED_EVENT, getAnalyticsConsent, type ConsentChoice } from '../lib/consent';

// OAuth redirects carry credentials in the URL (Supabase tokens in the hash, code/state
// in the query), so only utm_* params survive into what Vercel records.
function redactSensitiveUrl(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url, window.location.origin);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (!key.startsWith('utm_')) url.searchParams.delete(key);
  }
  return { ...event, url: url.toString() };
}

// The script's auto-tracking only hooks history.pushState, so <Navigate replace />
// redirects (including login -> dashboard) would go uncounted without explicit routes.
export function RouteAnalytics() {
  const { pathname } = useLocation();
  const [consent, setConsent] = useState<ConsentChoice | null>(() => getAnalyticsConsent());

  // beforeSend is registered with the Vercel script once, the first time <Analytics> mounts, and that
  // registration outlives any later unmount (the script never gets a chance to un-register it). So a
  // later revoke can only take effect if the handler reads consent live via this ref, not a snapshot
  // closed over at registration time.
  const consentRef = useRef(consent);
  useEffect(() => {
    consentRef.current = consent;
  });

  useEffect(() => {
    const onChange = (event: Event) => setConsent((event as CustomEvent<ConsentChoice>).detail);
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  }, []);

  const beforeSend = useCallback((event: BeforeSendEvent): BeforeSendEvent | null => {
    if (consentRef.current !== 'granted') return null;
    return redactSensitiveUrl(event);
  }, []);

  // `route` is the route pattern, so every process editor counts as one page. Keep this in sync with
  // the :param routes in App.tsx.
  const route = /^\/processes\/(?!new$)[^/]+$/.test(pathname) ? '/processes/[id]' : pathname;

  return (
    <>
      {/* The script itself is only fetched once analytics is allowed; nothing loads or sends before that. */}
      {consent === 'granted' && <Analytics route={route} path={pathname} beforeSend={beforeSend} />}
      <CookieConsent />
    </>
  );
}
