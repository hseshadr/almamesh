import { describe, expect, it } from "vitest";

import { EngineClient, MemoryCacheStore, syncIndex } from "@edgeproc/browser/engine";

// Proves the @edgeproc/browser/engine path dependency (the reused edge-reco sync
// tier) resolves and runs from inside @almamesh/browser — the foundation P2.3+
// build the Pyodide chart compute on top of.
describe("@edgeproc/browser/engine path dependency", () => {
  it("exposes the worker-backed sync client and the sync state machine", () => {
    expect(typeof EngineClient.spawn).toBe("function");
    expect(typeof syncIndex).toBe("function");
  });

  it("runs the in-memory content-addressed store: a fresh store has no active version", async () => {
    const store = new MemoryCacheStore();

    expect(await store.readActive()).toBeNull();
  });
});
