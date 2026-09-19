import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '../../components/ui/Logo';

import { LAST_UPDATED, LEGAL_LINKS } from './links';

export interface TocItem {
  id: string;
  label: string;
}

interface LegalPageProps {
  title: string;
  toc: TocItem[];
  /** e.g. "privacy@drivetag-ai.com" or "support@drivetag-ai.com" */
  contactEmail: string;
  children: ReactNode;
}

/** A single h2 section with a matching anchor id, used by both the TOC and `#id` deep links. */
export function LegalSection({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-3 text-2xl font-bold tracking-tight text-ink">{heading}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function LegalPage({ title, toc, contactEmail, children }: LegalPageProps) {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    document.title = `${title} · DriveTag AI`;
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
    // Intentionally only on mount/title change — deep links should scroll once, not on every hash tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 print:hidden">
        <Logo />
        <Link to="/" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
          <ArrowLeft className="h-4 w-4" /> Back home
        </Link>
      </div>

      <main id="main-content" className="mx-auto max-w-3xl px-4 pb-20 pt-4 sm:pt-8">
        <article>
          <h1 className="mb-2 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mb-8 text-sm font-semibold text-ink-soft">Last updated: {LAST_UPDATED}</p>

          <nav aria-label="On this page" className="mb-10 rounded-3xl border border-line bg-white p-5 shadow-soft print:hidden">
            <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-ink-soft">On this page</p>
            <ol className="grid gap-1.5 sm:grid-cols-2">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-sm font-semibold text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60">
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="legal-prose space-y-10 leading-relaxed text-ink-soft">{children}</div>

          <p className="mt-12 text-sm font-bold text-ink">
            Questions? Email{' '}
            <a className="text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
          </p>

          <nav aria-label="Legal" className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-8 text-sm font-bold text-ink-soft print:hidden">
            {LEGAL_LINKS.filter((link) => link.to !== pathname).map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-lg hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </article>
      </main>
    </div>
  );
}
