import { ApiError, type CurrentPlan, type ProcessKind, type Usage } from './api';
import { formatCount, formatDate, plural } from './format';

export function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 404 && err.message.startsWith('No route for')) {
    // The route itself is missing: this frontend deployed before the backend it needs.
    return 'DriveTag is updating. Refresh in a minute.';
  }
  return err instanceof Error ? err.message : fallback;
}

/** Google's rejection of a watch channel reads like jargon; say what it means. */
export function friendlyWatchError(message: string) {
  if (/webhook|callback channel/i.test(message)) {
    return 'Automatic sorting couldn’t start: Google only sends live updates to a public, verified web address, and this server doesn’t have one yet. You can still sort files with “Organize now”.';
  }
  return message;
}

/** Gemini tags are hyphen-separated slugs; show them as words. */
export function displayTag(tag: string) {
  return tag.replace(/-/g, ' ');
}

/** "image"/"images" or "document"/"documents" for a count, matching a process kind. Rows without `kind` are images. */
export function kindWord(kind: ProcessKind | null | undefined, count: number) {
  return kind === 'document' ? (count === 1 ? 'document' : 'documents') : count === 1 ? 'image' : 'images';
}

/** "3 documents" / "1 image" — drop-in for format.ts's plural() when the noun depends on the process kind. */
export function kindPlural(count: number, kind: ProcessKind | null | undefined) {
  return plural(count, kindWord(kind, 1), kindWord(kind, 2));
}

/** "an image" / "a document", for sentences introducing a single file. */
export function kindArticleWord(kind: ProcessKind | null | undefined) {
  return kind === 'document' ? 'a document' : 'an image';
}

function kindArticle(kind: ProcessKind | null | undefined) {
  return kind === 'document' ? 'a' : 'an';
}

/** Usage's fields are the plural `images`/`documents`; ProcessKind values are singular. */
export function kindUsageOf(usage: Usage, kind: ProcessKind | null | undefined) {
  return kind === 'document' ? usage.documents : usage.images;
}

/** "12 document credits" / "1 image credit" — the kind stays singular as a modifier, regardless of count. */
export function kindCredits(count: number, kind: ProcessKind | null | undefined) {
  return `${formatCount(count)} ${kindWord(kind, 1)} credit${count === 1 ? '' : 's'}`;
}

/** One line describing where the user stands on a kind's credits, for meters and banners. Defaults to images, so existing callers keep working. */
export function usageSummary(plan: CurrentPlan | null, usage: Usage | null, kind: ProcessKind = 'image') {
  if (!plan || !usage) return '';
  const kindUsage = kindUsageOf(usage, kind);
  const freeLimit = kind === 'document' ? plan.freeDocuments : plan.freeImages;
  const packPhrase = `${kindArticle(kind)} ${kindWord(kind, 1)} pack`;
  if (kindUsage.exhausted) {
    return plan.id === 'free'
      ? `You’ve used all ${kindPlural(kindUsage.freeLimit || freeLimit, kind)}. Upgrade or add ${packPhrase} to keep sorting.`
      : `You’ve used this period’s ${kindWord(kind, 2)}. They refill ${formatDate(usage.periodResetsAt)}, or add ${packPhrase}.`;
  }
  const extra =
    kindUsage.topupBalance > 0
      ? ` (including ${plural(kindUsage.topupBalance, `pack ${kindWord(kind, 1)}`, `pack ${kindWord(kind, 2)}`)})`
      : '';
  return `${kindPlural(kindUsage.remaining, kind)} left${extra}.`;
}

/** Plan-limit errors carry a code; the UI offers an upgrade instead of a dead end. */
export function isPlanLimitError(err: unknown) {
  return err instanceof ApiError && (err.code === 'process_limit_reached' || err.code === 'out_of_images' || err.code === 'out_of_documents');
}
