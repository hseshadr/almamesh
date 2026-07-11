# VENDORED — `@edgeproc/browser`

This directory is a **vendored copy** of the `@edgeproc/browser` package from the
(public) `edge-reco` repository. It is the in-browser edge-proc tier AlmaMesh
reuses for **signed-bundle sync into OPFS** (ed25519 + sha256, fail-closed). It
was vendored so a fresh clone of this repo builds with `bun install` alone — no
sibling checkout, no extra credentials.

| | |
|---|---|
| Source repo | `https://github.com/hseshadr/edge-reco.git` |
| Source path | `frontend/packages/edgeproc-browser/` |
| Vendored commit | `2471b0b0c6bc2f1ce84aceb34754f33f98f13a56` (main; includes PR #26 + `0da71f5` fail-closed bundle validation) |
| Vendored on | 2026-07-11 |
| License | Apache-2.0 (see `LICENSE` + `NOTICE` in this directory, copied verbatim from the edge-reco repo root) |

## What was copied / what wasn't

- **Copied byte-identical:** `src/**` (including the test suite and the committed
  `src/engine/__fixtures__` parity bundle), `package.json`, `tsconfig.json`,
  `vite.config.ts`, `biome.json`, `README.md`, `.gitignore`.
- **Not copied:** git history, `node_modules/`, `*.tsbuildinfo`.
- **Added here (not upstream):** `LICENSE`, `NOTICE` (from the edge-reco repo
  root, required to travel with an Apache-2.0 redistribution), and this file.

## Local adaptations (the only diffs from upstream)

1. `package.json`: removed the `"lint": "biome check ."` script and the
   `@biomejs/biome` devDependency. Vendored code keeps **upstream style**
   (Biome, tab indentation — `biome.json` is retained for reference); it is
   deliberately **not** covered by this repo's ESLint, and we don't run
   upstream's linter in this repo's gates. `typecheck` and `test` are kept and
   run as part of the workspace gates (`bun run --filter '*' typecheck`).
2. `src/engine/runtime.ts` (`configFromEnv`): the pinned verify key resolves
   ROOT-absolute — `new URL("/public.key", globalThis.location.origin)` —
   instead of upstream's `new URL("public.key", document.baseURI)`. Upstream's
   form breaks SPA deep links: a hard load of a nested route requests
   `/<route>/public.key`, the SPA fallback answers with index.html, and bundle
   signature verification fails closed (engine never boots). Covered by the
   alma-local regression test `src/engine/runtimeConfig.test.ts` (not an
   upstream file). Re-check on every re-vendor: upstream `main` still uses
   `document.baseURI` as of `2471b0b` — drop this adaptation only when the fix
   lands upstream. TODO: upstream it.

Do **not** hand-edit anything else in this directory. Upstream's `README.md`
relative links (`../../README.md`, `../../../src/edgereco`) refer to the
edge-reco repo layout, not this one.

## Notes for running its test suite

`src/engine/embedder.test.ts` contains a transformers.js↔Python embedding
parity suite that downloads a ~25 MB model on first run. Set
`EDGE_RECO_SKIP_EMBEDDING_PARITY=1` to keep the run offline/fast (this is the
documented upstream switch). Everything else runs offline against the committed
fixtures.

## Re-vendor policy (manual)

There is no automation; refresh deliberately when AlmaMesh needs an upstream
fix:

```bash
# from the almamesh repo root, with an edge-reco checkout at <EDGE_RECO>
rsync -a --delete \
  --exclude node_modules --exclude '*.tsbuildinfo' \
  --exclude LICENSE --exclude NOTICE --exclude VENDORED.md \
  <EDGE_RECO>/frontend/packages/edgeproc-browser/ \
  frontend/packages/edgeproc-browser/
cp <EDGE_RECO>/LICENSE <EDGE_RECO>/NOTICE frontend/packages/edgeproc-browser/
# re-apply local adaptation #1 (drop the lint script + @biomejs/biome devDep)
# and #2 (root-absolute /public.key in runtime.ts + restore
# src/engine/runtimeConfig.test.ts, which rsync --delete removes),
# update the "Vendored commit" / "Vendored on" fields above, then run the gates:
cd frontend && bun install && bun run --filter '*' typecheck
```
