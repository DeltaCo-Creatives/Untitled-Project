import { Link } from 'react-router-dom';
import { Logo } from './ui/Logo';
import { LEGAL_LINKS } from '../pages/legal/links';
import { openCookieSettings } from '../lib/consent';

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-10 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <Logo size="sm" />
          <p className="text-sm text-ink-soft">© 2026 DeltaCo Creatives · DriveTag AI</p>
        </div>

        <div className="flex flex-col items-center gap-3 sm:items-end">
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-bold text-ink-soft sm:justify-end">
            <Link
              to="/beta"
              className="rounded-lg hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
            >
              Beta access
            </Link>
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-lg hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-soft sm:justify-end">
            <button
              type="button"
              onClick={openCookieSettings}
              className="rounded-xl font-bold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
            >
              Cookie settings
            </button>
            <a
              href="mailto:support@drivetag-ai.com"
              className="rounded-lg hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
            >
              support@drivetag-ai.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
