import { useLocation } from 'react-router-dom';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';

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
  // `route` is meant to be the route pattern; pathname is only equivalent while no route has :params.
  return <Analytics route={pathname} path={pathname} beforeSend={redactSensitiveUrl} />;
}
