# Dependency policy — deliberately held majors

**TL;DR:** Everything not listed here floats on its caret range and should be
kept current. Registry dependencies are trusted through exact versions where
required, the frozen lock, integrity metadata, provenance tests, and unsuppressed
audits—not elapsed time. The majors below are **held on purpose** because each
newer major needs its own validated migration (live-driven, not just CI-green),
and `main` auto-deploys to almamesh.com. A held major must have a one-line
justification here (or at the pin site, cross-linked here); a hold without one is
a bug in this file.

## The holds

| Dependency | Held at | Where | Why (one line) |
|---|---|---|---|
| `vite` | `^6` | `frontend/apps/web/package.json` | The v6→v8 jump swaps the bundler core (rolldown); a bundler swap must land on its own live-driven branch — it must not ride unvalidated into auto-deploy. `frontend/packages/edgeproc-browser` (vendored, its own toolchain) is already on `^8`. |
| `@vitejs/plugin-react` | `^4` | `frontend/apps/web/package.json` | Paired with vite 6; it moves in the same branch as the vite bump (edgeproc-browser pairs `^6` with its vite 8). |
| `@mui/material` | `^7` | `frontend/apps/web/package.json` | The v9 migration is its own validated effort (theme + component API churn across every picker/modal surface). |
| `@mui/x-date-pickers` | `^8` | `frontend/apps/web/package.json` | Same v9 effort as MUI core — and the pickers carry a hard-won controlled-input scar (typed dates corrupted by controlled-value resync; only a real-browser probe reproduces it), so any bump needs live-browser validation of onboarding date/time entry. |
| `typescript` | `~5.7` | root + all `frontend/packages/*` and `apps/web` | TS6 needs ecosystem alignment (typescript-eslint, `tsc -b` project references) across all workspace packages at once — a single-package bump breaks the shared toolchain. edgeproc-browser (vendored) already runs `~6.0`. |
| `three` (+ `@types/three`) | `^0.172` | `frontend/apps/web/package.json` | three's 0.x minors are de-facto majors; a bump must be validated live against `@react-three/fiber` in the 3D force-field hero, not just typechecked. |
| `pyodide` | `^0.29` | `frontend/packages/browser/package.json` (mirrored by `PYODIDE_VERSION` in `frontend/apps/web/scripts/setup-dev-assets.sh`) | The version-pinned WASM runtime inside the signed bundle: a bump must re-pass the Pyodide==CPython byte-parity gate and re-ships the immutable `pyodide/*` CDN assets — see `docs/deploy/almamesh-com.md`. |
| `tailwindcss` | `^3.4` | `frontend/apps/web/package.json` | The v3→v4 migration replaces the config model (JS `tailwind.config` → CSS-first `@theme`) and the build integration (PostCSS plugin → `@tailwindcss/vite`), and this app's theme rides a shared preset (`@almamesh/constants` `tailwind.preset.js`); the whole visual surface must be re-validated live on its own branch, not ride into auto-deploy. |

## Never cap a security floor

`cryptography` (Python) is **deliberately not held.** It sits at
`>=50.0.0` — floor only, no ceiling — in `backend/pyproject.toml` `[tool.uv]`
`constraint-dependencies`.

It used to be held at `>=48.0.1,<49`, capped "to avoid the untested major." On
2026-08-03 three advisories landed against 48.0.1 (CVE-2026-69247 / -69248 /
-69249) and the scheduled `security-audit.yml` went red on `main`. Upstream's
only fix was a major, so **the cap was the thing blocking the fix.**

The lesson generalises: a ceiling on a floor whose entire job is "stay above
known CVEs" turns every major-delivered fix into a blocked build. These two
bounds want opposite things — do not put them on the same entry. Reproducibility
comes from the committed `uv.lock` plus `uv export --frozen` in CI, so the
ceiling was not buying determinism either.

Hold a Python major the normal way if it ever genuinely needs a migration: add a
row above with a real, specific reason. "Untested major" is not one.

## How to lift a hold

1. Branch off `main`; bump the one dependency (its paired deps may move with it, e.g. vite + `@vitejs/plugin-react`).
2. Run the full gates (`typecheck`, `test:unit`, `build`) **and drive the touched surface live** in the built app — pickers, 3D hero, and engine boot are the scar-bearing surfaces.
3. For `pyodide`: also run the byte-parity gate (`frontend/packages/browser` `bun run test:parity`) and the live exit gate.
4. Merge, delete the branch, and remove the row from this table (or update it if a new major supersedes the hold).
