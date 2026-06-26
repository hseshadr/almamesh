# VENDORED — shared-libs-python

**TL;DR:** This is a verbatim source snapshot of the private
`shared-libs-python` repo (a dependency of the vendored `edge-proc`), vendored
so `almamesh` builds from a single clone. Do not edit by hand — re-vendor from
upstream (policy below).

| | |
|---|---|
| Source repo | `git@github.com:hseshadr/shared-libs-python.git` (private) |
| Commit vendored | `0533ea0aa97f18d7db06b69efd2e5e0c5883bdb9` |
| Vendored on | 2026-06-11 |
| Upstream tree state | clean at that commit |
| License | **MIT — Copyright (c) 2025 Vector Management Team** (`LICENSE`, copied verbatim) |

## Legal / attribution (standing item)

The MIT license requires the copyright notice to be preserved. The upstream
`LICENSE` names **"Vector Management Team"** as the copyright holder (the
`pyproject.toml` author field names Harish Seshadri). The notice is preserved
verbatim here and MUST survive any re-vendor; clarifying/normalizing the
rights situation with upstream remains an open item to settle before this repo
goes public — do NOT alter the notice in this copy.

## What was copied

`shared_libs_python/` (the package, incl. the `vector_mgmt` subpackage),
`tests/` (its own 60-test suite), `pyproject.toml`, `uv.lock`, `LICENSE`,
`README.md`, `CHANGELOG.md` — byte-identical to upstream
(`__pycache__`/`.DS_Store` excluded). NOT copied (upstream repo meta, not
package source): `docs/`, `examples/`, `.github/`, `.claude/`, `CLAUDE.md`,
`CONTRIBUTING.md`, `SECURITY.md`, `.pre-commit-config.yaml`, `.gitattributes`,
`.gitignore`, coverage artifacts, caches, `.venv`.

## Resolution notes

- Consumed two ways, both in-repo: `backend/pyproject.toml`
  `[tool.uv.sources] shared-libs-python = { path = "vendor/shared-libs-python", editable = true }`,
  and the vendored `edge-proc`'s own source entry `../shared-libs-python`
  (which resolves to this directory — keep the two vendored dirs side by side).
- BaseSettings `extra="ignore"` check: this package defines **no
  `BaseSettings` subclass at all** (its only runtime dep is `pydantic`, not
  `pydantic-settings`) — verified by grep over `shared_libs_python/` at vendor
  time, so there is nothing to fix here. The known-required `extra="ignore"`
  fix lives in `edge-proc`'s `EdgeProcSettings` — see
  `../edge-proc/VENDORED.md`.

## Run its test suite

```bash
cd backend/vendor/shared-libs-python && uv run pytest -q
```

(The `.venv` it creates is gitignored.)

## Upstream-sync policy

Manual re-vendor only — no submodule, no subtree, no automation:

1. Land the change upstream in `hseshadr/shared-libs-python`.
2. Re-copy the files listed above verbatim from the new upstream commit
   (LICENSE notice intact).
3. Update the commit SHA + date in this file.
4. Re-run the backend gates and the Pyodide byte-parity gate.
