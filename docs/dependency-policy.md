# Dependency policy — deliberately held majors

**TL;DR:** Everything not listed here floats on its caret range and should be
kept current — but nothing enters the build until it is 24 hours old (see
[the cooldown](#the-24-hour-cooldown)). The majors below are **held on purpose** — each hold exists
because the newer major needs its own validated migration (live-driven, not
just CI-green), and `main` auto-deploys to almamesh.com. A held major must have
a one-line justification here (or at the pin site, cross-linked here); a hold
without one is a bug in this file.

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
| `cryptography` (Python) | `>=48.0.1,<49` | `backend/pyproject.toml` `[tool.uv]` `constraint-dependencies` | Security floor for the transitive ed25519 bundle-signing dep, capped below the untested major — rationale lives in-file next to the pin (bundle signing only; chart math and byte-determinism are unaffected). |
| `tailwindcss` | `^3.4` | `frontend/apps/web/package.json` | The v3→v4 migration replaces the config model (JS `tailwind.config` → CSS-first `@theme`) and the build integration (PostCSS plugin → `@tailwindcss/vite`), and this app's theme rides a shared preset (`@almamesh/constants` `tailwind.preset.js`); the whole visual surface must be re-validated live on its own branch, not ride into auto-deploy. |

## The 24-hour cooldown

`bun install` refuses any package version published less than 24 hours ago.
That window is when a compromised or hijacked release is live and still
undetected; most get caught and unpublished inside it. The setting is
`install.minimumReleaseAge = 86400` in `frontend/bunfig.toml` — **seconds**,
which is bun's unit, and the same 1440 minutes the pnpm frontends in this
portfolio enforce.

What you will actually see:

- Asking for a too-fresh version by name fails the install outright:
  `error: No version matching "<pkg>" found for specifier "<version>"
  (blocked by minimum-release-age: 86400 seconds)`, exit 1, nothing written.
- A caret range quietly resolves to the newest version that *is* old enough
  instead of failing. So a range does still float — just never onto something
  published today.

**A dependency failing here is the control working.** Wait the window out, or
pin the previous version. Never add `minimumReleaseAgeExcludes` — an exemption
disables the cooldown for that package everywhere, CI included, which is the
hole the setting exists to close. `apps/web/src/__tests__/supply-chain-cooldown.test.ts`
fails the build if the key, the value, or the no-exemptions rule is changed.

It gates *resolution*, so it does not re-check versions already pinned in
`bun.lock`, and a package already in bun's global cache is served from cache
and skips the check. CI installs cold, which is where it counts.

## How to lift a hold

1. Branch off `main`; bump the one dependency (its paired deps may move with it, e.g. vite + `@vitejs/plugin-react`).
2. Run the full gates (`typecheck`, `test:unit`, `build`) **and drive the touched surface live** in the built app — pickers, 3D hero, and engine boot are the scar-bearing surfaces.
3. For `pyodide`: also run the byte-parity gate (`frontend/packages/browser` `bun run test:parity`) and the live exit gate.
4. Merge, delete the branch, and remove the row from this table (or update it if a new major supersedes the hold).
