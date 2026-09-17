export function errorMessage(err: unknown, fallback: string) {
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
