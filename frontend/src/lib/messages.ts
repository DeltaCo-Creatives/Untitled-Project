import { ApiError, type CurrentPlan, type Usage } from './api';
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
    return 'Automatic sorting couldn’t start: Google only sends live updates to a public, verified web address, and this server doesn’t have one yet. You can still sort images with “Organize now”.';
  }
  return message;
}

/** Gemini tags are hyphen-separated slugs; show them as words. */
export function displayTag(tag: string) {
  return tag.replace(/-/g, ' ');
}

/** One line describing where the user stands on images, for meters and banners. */
export function usageSummary(plan: CurrentPlan | null, usage: Usage | null) {
  if (!plan || !usage) return '';
  if (usage.exhausted) {
    return plan.id === 'free'
      ? `You’ve used all ${formatCount(usage.freeLimit || plan.freeImages)} free images. Upgrade or add an image pack to keep sorting.`
      : `You’ve used this period’s images. They refill ${formatDate(usage.periodResetsAt)}, or add an image pack.`;
  }
  const extra = usage.topupBalance > 0 ? ` (including ${plural(usage.topupBalance, 'pack image', 'pack images')})` : '';
  return `${plural(usage.remaining, 'image', 'images')} left${extra}.`;
}

/** Plan-limit errors carry a code; the UI offers an upgrade instead of a dead end. */
export function isPlanLimitError(err: unknown) {
  return err instanceof ApiError && (err.code === 'process_limit_reached' || err.code === 'out_of_images');
}
