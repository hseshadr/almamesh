import { describe, expect, it } from "vitest";

import { chunkText } from "./chunk";

/** Build a deterministic N-word string ("w0 w1 w2 ..."). */
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
}

describe("chunkText", () => {
  it("returns a single trimmed chunk for short text", () => {
    const chunks = chunkText("  hello there world  ");
    expect(chunks).toEqual(["hello there world"]);
  });

  it("returns an empty array for whitespace-only text", () => {
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("splits long text into multiple ~200-word windows", () => {
    const chunks = chunkText(words(500), { windowWords: 200, overlapWords: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    // First window starts at the very first word.
    expect(chunks[0].startsWith("w0 ")).toBe(true);
    // Every chunk is non-empty and trimmed.
    for (const c of chunks) {
      expect(c.length).toBeGreaterThan(0);
      expect(c).toBe(c.trim());
    }
  });

  it("overlaps consecutive windows by the configured overlap", () => {
    const chunks = chunkText(words(60), { windowWords: 25, overlapWords: 5 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const first = chunks[0].split(/\s+/);
    const second = chunks[1].split(/\s+/);
    // The first window ends with w24; with overlap 5 the second starts at w20.
    expect(first[first.length - 1]).toBe("w24");
    expect(second[0]).toBe("w20");
  });

  it("covers every word across the windows (no gaps)", () => {
    const chunks = chunkText(words(120), { windowWords: 40, overlapWords: 10 });
    const seen = new Set<string>();
    for (const c of chunks) {
      for (const w of c.split(/\s+/)) {
        seen.add(w);
      }
    }
    for (let i = 0; i < 120; i += 1) {
      expect(seen.has(`w${i}`)).toBe(true);
    }
  });

  it("is deterministic for identical inputs", () => {
    const a = chunkText(words(300));
    const b = chunkText(words(300));
    expect(a).toEqual(b);
  });
});
