// Multi-turn chat history token budgeting.
//
// A cheap, dependency-free estimator (chars/4) and a drop-oldest trimmer so a
// long conversation fits a small model's context window. Deterministic and pure
// → unit-testable. The most-recent turn (the current question) is NEVER dropped,
// even if it alone exceeds the budget: a truncated question is worse than a
// slightly over-budget one.

/** One prior conversational turn. No chart identifiers — plain UI strings. */
export interface ChatTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

const CHARS_PER_TOKEN = 4;

/** Heuristic token count for a string: ceil(chars / 4). No tokenizer needed. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Trim history to fit `maxTokens`, dropping OLDEST turns first. The final turn
 * is always kept (the in-flight question). Returns a most-recent-first-preserved
 * suffix of the input in original order.
 */
export function trimHistoryToBudget(
  history: readonly ChatTurn[],
  maxTokens: number,
): readonly ChatTurn[] {
  if (history.length === 0) {
    return [];
  }
  // Walk newest -> oldest, accumulating until the next turn would overflow.
  const kept: ChatTurn[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    const cost = estimateTokens(turn.content);
    const isCurrent = i === history.length - 1;
    if (!isCurrent && used + cost > maxTokens) {
      break;
    }
    kept.unshift(turn);
    used += cost;
  }
  return kept;
}
