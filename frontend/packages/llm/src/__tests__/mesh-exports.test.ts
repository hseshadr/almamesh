import { describe, expect, it } from "vitest";

// The mesh narration surface must be reachable from the package barrel — the
// store/web layers import ONLY from "@almamesh/llm" (= ../index).
import {
  ANTI_SCAM_RELATIONSHIP_FENCE,
  buildMeshFactsBlock,
  MESH_BLOCK_END,
  MESH_BLOCK_START,
  meshRoleLabels,
  sanitizeMeshEdgeForLlm,
  streamMeshReading,
} from "../index";

describe("@almamesh/llm — mesh public surface", () => {
  it("exports the pair sanitizer, role labels, facts block, and reading", () => {
    expect(typeof sanitizeMeshEdgeForLlm).toBe("function");
    expect(typeof meshRoleLabels).toBe("function");
    expect(typeof buildMeshFactsBlock).toBe("function");
    expect(typeof streamMeshReading).toBe("function");
  });

  it("exports the mesh block delimiters and the anti-scam fence", () => {
    expect(MESH_BLOCK_START).toContain("ENGINE RELATIONSHIP CONTEXT");
    expect(MESH_BLOCK_END).toContain("END ENGINE RELATIONSHIP CONTEXT");
    expect(ANTI_SCAM_RELATIONSHIP_FENCE).toContain("NEVER advise marrying, leaving");
  });

  it("keeps graceful absence at the barrel too (no edge -> empty string)", () => {
    expect(buildMeshFactsBlock(undefined)).toBe("");
  });
});
