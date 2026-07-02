// Vitest config for the bench harness's OWN unit tests (mocked endpoints, no
// network). Deliberately separate from the package's vitest.config.ts: the
// bench is a manual tool and its tests are not part of the package test run.
//
//   cd frontend/packages/llm && bunx vitest run -c bench/vitest.config.ts

import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const BENCH_ROOT = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    root: BENCH_ROOT,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
  },
});
