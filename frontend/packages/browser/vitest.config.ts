import { defineConfig } from "vitest/config";

// `@edgeproc/browser/*` (the reusable edge-proc sync tier) is a workspace
// package vendored at ../edgeproc-browser; it ships raw TS which Vitest
// compiles as source via its package.json `exports` map — no aliases needed.
export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
