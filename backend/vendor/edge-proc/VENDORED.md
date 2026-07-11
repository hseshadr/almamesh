# VENDORED — edge-proc

**TL;DR:** This is a verbatim source snapshot of the `edge-proc` repo, vendored
so `almamesh` builds from a single clone (no `~/dev/oss` siblings, no
PAT). Do not edit by hand — re-vendor from upstream (policy below).

| | |
|---|---|
| Source repo | `https://github.com/hseshadr/edge-proc.git` (public) |
| Commit vendored | `3dabffa61e8063e4781f8c9ae4bedc24656c130c` (tag `v0.1.2`) |
| Vendored on | 2026-07-11 |
| Upstream tree state | clean at that tag |
| License | MIT — Copyright (c) 2026 Harish Seshadri (`LICENSE`, copied verbatim) |

## What was copied

`edgeproc/` (the package), `tests/` (its own 151-test suite), `pyproject.toml`,
`uv.lock`, `LICENSE`, `README.md`, `CHANGELOG.md` — byte-identical to upstream
(`__pycache__`/`.DS_Store` excluded). NOT copied (upstream repo meta, not
package source): `docs/`, `examples/`, `.github/`, `.gitignore`, `.env.example`,
`pyrightconfig.json`, `CLAUDE.md`, `CITATION.cff`, `CODE_OF_CONDUCT.md`,
`CONTRIBUTING.md`, `ROADMAP.md`, `SECURITY.md`, caches, `.venv`.

## Resolution notes

- `backend/pyproject.toml` consumes this via
  `[tool.uv.sources] edge-proc = { path = "vendor/edge-proc", editable = true }`.
- **Recorded local adaptation (the only diffs from upstream `v0.1.2`):** upstream's
  `pyproject.toml` ships the `shared-libs-python` source as a git-tag pin
  (`tag = "v0.1.3"`) with a commented path-source override for co-development.
  This snapshot flips that upstream-documented toggle so `[tool.uv.sources]`
  points `shared-libs-python` at `../shared-libs-python` — the sibling vendored
  copy at `backend/vendor/shared-libs-python` (single-clone build, no network
  fetch, and the vendored suite tests against the exact vendored dependency).
  Keep the two vendored dirs side by side, and keep the path source active on
  every re-vendor. Consequence: `uv.lock` here is upstream's lock plus the
  `uv lock` reconciliation for that source swap (the `shared-libs-python`
  entry re-locks from the git-tag source to the editable path source).
- `EdgeProcSettings` (`edgeproc/core/settings.py`) uses
  `SettingsConfigDict(env_prefix="EDGEPROC_", extra="ignore")` — REQUIRED.
  `extra="forbid"` would crash any host app with its own populated `.env`
  (this bit us before). Verified present in this snapshot. The
  `extra="forbid"` occurrences in `edgeproc/bundles/manifest.py` are plain
  pydantic `ConfigDict` on signed-manifest models — strict schema validation,
  intentional, NOT env settings.

## Run its test suite

```bash
cd backend/vendor/edge-proc && uv run --all-extras pytest -q
```

(`--all-extras` pulls the `bundles` + `localvec` extras its tests exercise;
its own `uv.lock` pins them. The `.venv` it creates is gitignored.)

## Upstream-sync policy

Manual re-vendor only — no submodule, no subtree, no automation:

1. Land the change upstream in `hseshadr/edge-proc` (its own tests + gates).
2. Re-copy the files listed above verbatim from the new upstream commit.
3. Update the commit SHA + date in this file.
4. Re-run the backend gates and the Pyodide byte-parity gate
   (`frontend/packages/browser: bun run test:parity`).

Never patch the vendored copy directly; if an emergency local patch is
unavoidable, record it here and upstream it immediately.
