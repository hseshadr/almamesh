import { describe, expect, it } from "vitest";

import { estimateTokens, trimHistoryToBudget, type ChatTurn } from "../budget";

describe("estimateTokens", () => {
  it("uses the chars/4 heuristic, rounding up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("trimHistoryToBudget", () => {
  const turn = (role: ChatTurn["role"], content: string): ChatTurn => ({ role, content });

  it("returns the whole history when it fits the budget", () => {
    const history: ChatTurn[] = [turn("user", "hi"), turn("assistant", "hello")];
    expect(trimHistoryToBudget(history, 1000)).toEqual(history);
  });

  it("drops oldest turns first until the rest fit", () => {
    // Each content is 40 chars => ~10 tokens each.
    const a = turn("user", "a".repeat(40));
    const b = turn("assistant", "b".repeat(40));
    const c = turn("user", "c".repeat(40));
    // Budget for ~20 tokens => only the two most-recent (b, c) fit.
    const trimmed = trimHistoryToBudget([a, b, c], 20);
    expect(trimmed).toEqual([b, c]);
  });

  it("never drops the current (most-recent) question even if it alone exceeds budget", () => {
    const current = turn("user", "z".repeat(400)); // ~100 tokens
    const trimmed = trimHistoryToBudget([turn("user", "old"), current], 5);
    expect(trimmed).toEqual([current]);
  });

  it("returns an empty array for empty history", () => {
    expect(trimHistoryToBudget([], 100)).toEqual([]);
  });
});
