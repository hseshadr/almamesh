# VENDORED — `@edgeproc/errors`

This directory is a **vendored copy** of the `@edgeproc/errors` package — the
portfolio's canonical-errors standard library: register a per-app catalog of
stable error codes, classify raw transport/LLM failures into those codes,
describe them via your own i18next, and serialize to RFC 9457 Problem Details.
**Zero runtime dependencies.**

It was vendored so a fresh clone of this repo builds with `bun install` alone —
no sibling checkout, no npm publish, no extra credentials — exactly the way this
repo already vendors `@edgeproc/browser` at `packages/edgeproc-browser/`.

| | |
|---|---|
| Source repo | `hseshadr/errors` (`~/dev/oss/errors`) |
| Source path | repo root (`src/`, `test/`) |
| Vendored commit | `7705a72c938c0e0e18ae51c87f38820d31b8be6e` (`Initial @edgeproc/errors: canonical error glue (TDD)`) |
| Vendored on | 2026-07-14 |
| License | MIT (see `LICENSE`, copied verbatim from the source repo) |

## Why AlmaMesh is the reference consumer

AlmaMesh is the first portfolio app to adopt `@edgeproc/errors` for real. The
AI connection-error classification seam in
`apps/web/src/lib/errors.ts` (`classifyConnectionError`) now routes through this
library's registry instead of an ad-hoc `if`-chain. The mapping is
**behaviour-identical** — the same HTTP status still produces the same coded
error and the same existing `chat:errors.*` i18n string. See
`apps/web/src/lib/errors.ts` and `apps/web/src/lib/errors.test.ts`.

## What was copied / what wasn't

- **Copied byte-identical:** `src/**` (the library), `test/**` (its 56-test
  suite), `tsconfig.json`, `vitest.config.ts`, `biome.json`, `README.md`,
  `.gitignore`.
- **Not copied:** git history, `node_modules/`, `dist/`, `coverage/`, the
  `pnpm-lock.yaml` / `pnpm-workspace.yaml` (this repo is a Bun workspace),
  `tsconfig.build.json` (no build step — see below).
- **Added here (not upstream):** `LICENSE` travels with the redistribution and
  this file.

## Local adaptations (the only diffs from upstream)

1. **`package.json`** — rewritten for this Bun workspace, mirroring
   `@edgeproc/browser` and the `@almamesh/*` packages:
   - `exports["."]` points at **`./src/index.ts`** (TypeScript source consumed
     directly by Vite/Vitest/`tsc`), so there is **no build step and no `dist/`**.
   - Kept only the `typecheck` and `test` scripts (both run in the workspace
     gates: `bun run --filter '*' typecheck` and
     `bun run --filter @edgeproc/errors test`).
   - Dropped upstream's `build` / `demo` / `lint` / `lint:fix` / `gate` scripts,
     the `@biomejs/biome` and `@vitest/coverage-v8` devDependencies (this repo
     does not run upstream's Biome lint or per-package coverage; `biome.json` is
     retained for reference only), and the `packageManager` / `engines` / `files`
     fields.
   - Pinned `typescript` / `@types/node` / `vitest` to this workspace's versions
     so `bun install` resolves a single shared copy.
2. **No source diffs.** `src/**` and `test/**` are byte-identical to upstream;
   `tsconfig.json` (NodeNext, `noEmit`) and `vitest.config.ts` are unchanged.
