import { CheckCircle2, Clock3, FileText, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { FileLimits } from '../../lib/api';
import { formatCount, plural } from '../../lib/format';

interface DocumentsExplainerProps {
  fileLimits: FileLimits;
  /** A single short paragraph instead of the full breakdown, for tight spots like the landing page. */
  compact?: boolean;
  className?: string;
}

const SUPPORTED_TYPES = 'PDF, Word (.docx), Google Docs, Sheets and Slides, and text, Markdown or CSV files';

/** Documents are live and sorted exactly like images — this explains how a document turns into one credit. */
export function DocumentsExplainer({ fileLimits, compact = false, className = '' }: DocumentsExplainerProps) {
  const { pagesRead, textChars, documentMaxMb, editingGraceMinutes } = fileLimits;

  if (compact) {
    return (
      <p className={`mx-auto max-w-2xl text-center text-sm leading-relaxed text-ink-soft ${className}`}>
        Documents sort just like images. The AI reads at most the first {plural(pagesRead, 'page', 'pages')} of a PDF
        (or about {formatCount(textChars)} characters of text), so one document is one document credit no matter how
        long it is. {SUPPORTED_TYPES} are supported.
      </p>
    );
  }

  const facts: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: FileText,
      title: 'One document, one credit',
      body: `Whatever its length, a document costs one document credit — the AI only reads the first ${plural(pagesRead, 'page', 'pages')} of a PDF, or about ${formatCount(textChars)} characters of text.`,
    },
    {
      icon: ShieldCheck,
      title: 'Oversized files are skipped, not charged',
      body: `Files over ${documentMaxMb} MB are never downloaded or charged — they’re left in Raw untouched.`,
    },
    {
      icon: CheckCircle2,
      title: 'What’s supported',
      body: `${SUPPORTED_TYPES}.`,
    },
    {
      icon: Clock3,
      title: 'Still being edited? DriveTag waits',
      body: `A Google Doc, Sheet or Slide edited in the last ${plural(editingGraceMinutes, 'minute', 'minutes')} is left alone — nothing moves while someone might still be writing it. Once the edits stop, DriveTag sorts it on its own.`,
    },
  ];

  return (
    <section
      id="documents-explainer"
      aria-labelledby="documents-explainer-heading"
      className={`mx-auto max-w-5xl scroll-mt-24 px-4 pb-20 ${className}`}
    >
      <div className="mb-10 text-center">
        <p className="mb-3 text-sm font-extrabold uppercase tracking-widest text-ink-soft">Documents</p>
        <h2 id="documents-explainer-heading" className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          How documents are counted
        </h2>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-ink-soft">
          Documents are sorted exactly like images — dropped in a Raw folder, read in memory, renamed and filed.
          Nothing is ever stored.
        </p>
      </div>
      <dl className="grid gap-5 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.title} className="rounded-[2rem] border border-line bg-white p-6 shadow-soft">
            <dt className="mb-2 flex items-center gap-3 font-display text-lg font-semibold">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-periwinkle-soft">
                <fact.icon className="h-5 w-5 text-ink" aria-hidden />
              </span>
              {fact.title}
            </dt>
            <dd className="leading-relaxed text-ink-soft">{fact.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
