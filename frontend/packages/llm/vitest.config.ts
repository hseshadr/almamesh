import { defineConfig } from "vitest/config";

// `@almamesh/browser`'s `@edgeproc/browser/*` imports resolve through the
// workspace (vendored at ../edgeproc-browser, TS source via `exports`), so no
// alias mirroring is needed here anymore.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
