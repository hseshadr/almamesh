# VENDORED — edge-proc

**TL;DR:** This is a verbatim source snapshot of the private `edge-proc` repo,
vendored so `almamesh` builds from a single clone (no `~/dev/oss` siblings, no
PAT). Do not edit by hand — re-vendor from upstream (policy below).

| | |
|---|---|
| Source repo | `git@github.com:hseshadr/edge-proc.git` (private) |
| Commit vendored | `e3f1faaaceed41b5ad4377d216fa198db30a2d14` |
| Vendored on | 2026-06-11 |
| Upstream tree state | clean at that commit (only an untracked `.serena/` agent cache, not copied) |
| License | MIT — Copyright (c) 2026 Harish Seshadri (`LICENSE`, copied verbatim) |

## What was copied

`edgeproc/` (the package), `tests/` (its own 151-test suite), `pyproject.toml`,
`uv.lock`, `LICENSE`, `README.md`, `CHANGELOG.md` — byte-identical to upstream
(`__pycache__`/`.DS_Store` excluded). NOT copied (upstream repo meta, not
package source): `docs/`, `examples/`, `.github/`, `.gitignore`, `.env.example`,
`pyrightconfig.json`, caches, `.venv`.

## Resolution notes

- `backend/pyproject.toml` consumes this via
  `[tool.uv.sources] edge-proc = { path = "vendor/edge-proc", editable = true }`.
- This package's own `[tool.uv.sources]` points its `shared-libs-python`
  dependency at `../shared-libs-python` — which resolves to the sibling
  vendored copy at `backend/vendor/shared-libs-python`. Keep the two vendored
  dirs side by side.
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
