import { defineConfig } from "vitest/config";

// `@edgeproc/browser` (the edge-proc sync substrate) is a published npm
// dependency shipping built ESM + .d.ts, so Vitest resolves it from
// node_modules through its `exports` map — no aliases needed.
export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
