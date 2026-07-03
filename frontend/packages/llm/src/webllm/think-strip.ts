// Defensive strip of ONE leading empty `<think>` block from on-device output.
//
// WebLLM 0.2.84 reacts to `enable_thinking: false` by splicing a literal
// `"<think>\n\n</think>\n\n"` into the prompt AND the decoded stream when the
// model's tokenizer lacks the think token — and Qwen3 itself can echo the
// empty block even with thinking suppressed. The reader must never see it.
//
// Only the EMPTY block is garbage: a think block with real content is left
// verbatim (it signals a misconfiguration worth seeing, never silent loss).

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/** `^\s*<think>\s*</think>\s*` — the empty injection plus surrounding whitespace. */
const LEADING_EMPTY_THINK = /^\s*<think>\s*<\/think>\s*/;

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

/** Strip one leading empty `<think>` block (and surrounding whitespace) from text. */
export function stripLeadingEmptyThink(text: string): string {
  return text.replace(LEADING_EMPTY_THINK, "");
}

function skipWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && isWhitespace(text[i])) {
    i += 1;
  }
  return i;
}

/**
 * True while `buffer` is still an ambiguous PREFIX of the leading-empty-think
 * pattern — i.e. more deltas are needed before we know whether to strip. Once
 * the buffer diverges (real content) or completes the block with content
 * after it, the stream wrapper resolves and flushes.
 */
function couldStillBecomeEmptyThink(buffer: string): boolean {
  const afterLeadingWs = skipWhitespace(buffer, 0);
  const rest = buffer.slice(afterLeadingWs);
  if (rest.length <= OPEN_TAG.length) {
    return OPEN_TAG.startsWith(rest);
  }
  if (!rest.startsWith(OPEN_TAG)) {
    return false;
  }
  const afterInnerWs = skipWhitespace(rest, OPEN_TAG.length);
  const tail = rest.slice(afterInnerWs);
  if (tail.length <= CLOSE_TAG.length) {
    return CLOSE_TAG.startsWith(tail);
  }
  if (!tail.startsWith(CLOSE_TAG)) {
    // Non-whitespace think CONTENT: a real (non-empty) block — pass through.
    return false;
  }
  // Full empty block seen; keep holding only while everything after it is
  // whitespace (the trailing "\n\n" of the injection literal).
  return [...tail.slice(CLOSE_TAG.length)].every(isWhitespace);
}

/**
 * Wrap a token-delta stream, removing one leading empty `<think>` block (plus
 * surrounding whitespace). Deltas are buffered ONLY while the prefix is still
 * ambiguous; ordinary answers flush from the first delta. Source errors
 * (aborts included) propagate untouched.
 */
export async function* stripLeadingEmptyThinkStream(
  source: AsyncIterable<string>,
): AsyncGenerator<string> {
  let buffer = "";
  let resolving = true;
  for await (const delta of source) {
    if (!resolving) {
      yield delta;
      continue;
    }
    buffer += delta;
    if (couldStillBecomeEmptyThink(buffer)) {
      continue;
    }
    resolving = false;
    const flushed = stripLeadingEmptyThink(buffer);
    if (flushed !== "") {
      yield flushed;
    }
  }
  if (resolving) {
    // Stream ended while still ambiguous (e.g. it WAS only the empty block).
    const flushed = stripLeadingEmptyThink(buffer);
    if (flushed !== "") {
      yield flushed;
    }
  }
}
