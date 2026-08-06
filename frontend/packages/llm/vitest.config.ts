import { defineConfig } from "vitest/config";

// `@almamesh/browser`'s `@edgeproc/browser` imports resolve from node_modules
// (a published package shipping built ESM via its `exports` map), so no alias
// mirroring is needed here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
