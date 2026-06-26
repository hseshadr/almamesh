import { describe, expect, it } from "vitest";

import { cosineSimilarity } from "./cosine";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(v, new Float32Array([1, 2, 3, 4]))).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 6);
  });

  it("returns -1 for opposite vectors", () => {
    const a = new Float32Array([1, 1]);
    const b = new Float32Array([-1, -1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 6);
  });

  it("is invariant to magnitude (direction only)", () => {
    const a = new Float32Array([3, 0]);
    const b = new Float32Array([100, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });

  it("ranks a closer direction above a farther one", () => {
    const query = new Float32Array([1, 0]);
    const near = new Float32Array([0.9, 0.1]);
    const far = new Float32Array([0.1, 0.9]);
    expect(cosineSimilarity(query, near)).toBeGreaterThan(
      cosineSimilarity(query, far),
    );
  });

  it("returns 0 when either vector is all zeros (no division by zero)", () => {
    expect(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([1, 1]))).toBe(0);
  });

  it("throws on length mismatch", () => {
    expect(() => cosineSimilarity(new Float32Array([1, 2]), new Float32Array([1]))).toThrow();
  });
});
