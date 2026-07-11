/**
 * Detects a failed dynamic `import()` of a code-split chunk — the signature of a
 * stale/poisoned service-worker cache after a deploy (a lazy route chunk resolves
 * to HTML or 404s, so `import()` rejects). Browsers word this differently, so we
 * match the known messages across engines plus the webpack-style error name.
 *
 * Used by both the {@link lazyWithRetry} route wrapper and the global
 * ErrorBoundary so a chunk failure triggers an update-aware reload instead of a
 * dead-end "Something went wrong" card.
 */
const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [^\s]+ failed|ChunkLoadError/i;

export function isChunkLoadError(error: unknown): boolean {
  if (typeof error === 'string') {
    return CHUNK_ERROR_PATTERN.test(error);
  }
  if (error instanceof Error) {
    return CHUNK_ERROR_PATTERN.test(error.name) || CHUNK_ERROR_PATTERN.test(error.message);
  }
  return false;
}
