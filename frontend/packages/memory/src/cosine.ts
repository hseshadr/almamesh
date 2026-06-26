/**
 * Cosine similarity between two embedding vectors — the relevance score the
 * vector store ranks retrieval by. Pure and allocation-free.
 *
 * Returns the cosine of the angle between `a` and `b` in [-1, 1]: 1 = identical
 * direction, 0 = orthogonal/unrelated, -1 = opposite. A zero-magnitude vector
 * has no direction, so it scores 0 rather than dividing by zero.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: length mismatch (${a.length} vs ${b.length})`,
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
