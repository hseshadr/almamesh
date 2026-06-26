/**
 * Pure, deterministic text chunking for the chat-memory RAG index.
 *
 * Each chat message is split into fixed-size, overlapping word windows so that
 * semantic search can retrieve a focused passage rather than a whole message.
 * Overlap keeps a thought that straddles a window boundary recoverable from at
 * least one chunk. No model, no I/O — same input always yields the same chunks.
 */

/** Tuning knobs for {@link chunkText}; sensible defaults target ~200-word windows. */
export interface ChunkOptions {
  /** Target window size in words. Default 200. */
  readonly windowWords?: number;
  /** Words shared between consecutive windows. Default 20. */
  readonly overlapWords?: number;
}

const DEFAULT_WINDOW_WORDS = 200;
const DEFAULT_OVERLAP_WORDS = 20;

/** Split on any run of whitespace; drop empties from leading/trailing space. */
function toWords(text: string): string[] {
  return text.trim().split(/\s+/u).filter((w) => w.length > 0);
}

/** Clamp the step so windows always advance by at least one word. */
function strideFor(windowWords: number, overlapWords: number): number {
  const stride = windowWords - overlapWords;
  return stride > 0 ? stride : windowWords;
}

/**
 * Split `text` into ~`windowWords`-word chunks overlapping by `overlapWords`.
 * Short text collapses to a single trimmed chunk; whitespace-only yields `[]`.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const windowWords = opts.windowWords ?? DEFAULT_WINDOW_WORDS;
  const overlapWords = opts.overlapWords ?? DEFAULT_OVERLAP_WORDS;
  const allWords = toWords(text);
  if (allWords.length === 0) {
    return [];
  }
  if (allWords.length <= windowWords) {
    return [allWords.join(" ")];
  }
  const stride = strideFor(windowWords, overlapWords);
  const chunks: string[] = [];
  for (let start = 0; start < allWords.length; start += stride) {
    chunks.push(allWords.slice(start, start + windowWords).join(" "));
    if (start + windowWords >= allWords.length) {
      break;
    }
  }
  return chunks;
}
