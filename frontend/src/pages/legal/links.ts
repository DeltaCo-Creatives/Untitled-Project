// Kept out of LegalPage.tsx so that file only exports components (fast refresh).
export const LAST_UPDATED = 'September 19, 2026';

/** Every legal page, for the in-page "related policies" nav and the site footer. */
export const LEGAL_LINKS = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/refunds', label: 'Refund Policy' },
  { to: '/cookies', label: 'Cookie Policy' },
  { to: '/data-deletion', label: 'Data deletion' },
] as const;
