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
| Base vendored commit | `2471b0b0c6bc2f1ce84aceb34754f33f98f13a56` (main; includes PR #26 + `0da71f5` fail-closed bundle validation) |
| Vendored on | 2026-07-11 |
| AlmaMesh security refresh | 2026-07-15 (downstream adaptations below; covered by the vendored package gate) |
| License | Apache-2.0 (see `LICENSE` + `NOTICE` in this directory, copied verbatim from the edge-reco repo root) |

## What was copied / what wasn't

- **Originally copied byte-identical:** `src/**` (including the test suite and
  committed `src/engine/__fixtures__` parity bundle), `package.json`,
  `tsconfig.json`, `vite.config.ts`, `biome.json`, `README.md`, `.gitignore`.
  The exact downstream security changes since that copy are enumerated below.
- **Not copied:** git history, `node_modules/`, `*.tsbuildinfo`.
- **Added here (not upstream):** `LICENSE`, `NOTICE` (from the edge-reco repo
  root, required to travel with an Apache-2.0 redistribution), and this file.

## Local adaptations (the only diffs from the base commit)

1. `package.json`: removed the `"lint": "biome check ."` script and the
   `@biomejs/biome` devDependency. Vitest and its V8 coverage provider are
   pinned to the same exact `4.0.16` release so coverage never runs across an
   unsupported mixed-version pair. Vendored code keeps **upstream style**
   (Biome, tab indentation — `biome.json` is retained for reference); it is
   deliberately **not** covered by this repo's ESLint. `typecheck`, `test`, and
   `test:coverage` remain executable from the workspace.
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
3. The signed-bundle ingestion boundary (`fetchBytes.ts`, `integrity.ts`,
   `zstd.ts`, both stores, `sync.ts`, and their contracts/tests) is hardened
   downstream while the matching EdgeReco change is being finalized:
   response deadlines include body consumption; response, manifest, chunk,
   reference, file, and aggregate byte counts are bounded; zstd output is
   limited to the signed plaintext size; malformed manifests fail closed;
   immutable chunks download through an eight-worker ceiling; and rollback or
   equal-sequence equivocation is rejected before the manifest fetch.
4. The production Worker protocol carries a required expected bundle identity
   and channel. AlmaMesh pins `almamesh-constructs` / `stable`; a signature made
   by the trusted key for a different product or channel is rejected before any
   immutable fetch. The low-level `syncIndex` API keeps optional pins for fixture
   and migration callers, but production always supplies both.
5. The parity fixture's mutable pointer is re-signed with bundle identity,
   channel, and monotonic sequence. `syncHardening.test.ts` and
   `fetchBytes.test.ts` are AlmaMesh-held regression suites until the reviewed
   upstream commit is re-vendored.
6. `vite.config.ts` enforces at least 90% statements, branches, functions, and
   lines on the unit-tested core. Boundary modules remain assigned to real-
   browser Playwright lanes as documented in the config.

Do not add an unrecorded local diff. Every necessary downstream change belongs
in the numbered list above with a regression test. Upstream's `README.md`
relative links (`../../README.md`, `../../../src/edgereco`) still refer to the
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
# re-apply or deliberately retire every numbered local adaptation above;
# restore AlmaMesh-only regression tests that rsync --delete removes;
# update the base commit / vendored date fields, then run the gates:
cd frontend
bun install
bun run --filter @edgeproc/browser test:coverage
bun run --filter '*' typecheck
```
