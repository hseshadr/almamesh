# Contributing to AlmaMesh

Thanks for your interest in AlmaMesh — a free, offline, local-first Vedic
astrology app that runs entirely in the browser. **There is no server, no
database, and no account system.** The Python package is the deterministic chart
engine plus a build-time signed-bundle publisher; the React/Vite app is the whole
product surface. Please keep contributions aligned with that local-first,
zero-egress design.

By contributing you agree your contributions are licensed under the project's
[MIT License](./LICENSE).

## TL;DR — clone to running app

```bash
git clone https://github.com/<owner>/almamesh.git
cd almamesh
uv run poe demo        # installs deps, builds dev assets, builds + previews the PWA
                       # → open http://localhost:4173
```

`uv run poe demo` is the turnkey path (use `poe demo-fresh` to re-sign the dev
bundle). The first run fetches the Pyodide dist + DE421 ephemeris once; after that
the app is fully offline.

> **Why `build && preview`, not `dev`?** The in-browser engine's module Workers
> only resolve in a production build, **not** under `vite dev`. To run/verify the
> app end-to-end you must build first, then preview.

## Repository layout

- `backend/` — the Python `almamesh` engine (Skyfield + DE421) and the
  `almamesh-bundle` signed-bundle publisher CLI. Runs on CPython **and** under
  Pyodide, byte-identical.
- `frontend/` — a Bun workspace monorepo. `apps/web` is the PWA; `packages/*` are
  the in-browser engine, stores/adapters, shared types, LLM narration, and memory.

## Running the test suites

**Backend (Python):**

```bash
cd backend
uv sync --extra dev
uv run pytest -q                       # engine tests incl. the DE421 golden-parity fixture
uv run ruff format . && uv run ruff check --fix . && uv run mypy src/
```

**Frontend (Bun):**

```bash
cd frontend
bun install
bun run --filter '*' typecheck         # all packages type-clean
cd apps/web && bun run test:unit       # Vitest

# Pyodide == CPython byte-parity gate:
cd ../../packages/browser && bun run test:parity
```

## Quality gates (must pass before a PR is mergeable)

A change is not done until all of these are green:

1. `cd backend && uv run pytest` — engine tests pass (incl. the DE421 golden
   fixture).
2. `uv run ruff check .` and `uv run ruff format --check .` — clean and formatted.
3. `cd frontend && bun run --filter '*' typecheck` — frontend types clean.
4. `bun run test:unit` (Vitest) green and the `test:parity` (Pyodide==CPython)
   gate green.
5. The app **builds and previews** (`bun run build && bun run preview` in
   `apps/web`) — remember module Workers do **not** run under `vite dev`.
6. **Validate end-to-end live:** drive the built + previewed app and confirm the
   journey you changed actually works on screen (reachable, correct, clean
   console). The live exit gate
   (`cd frontend/apps/web && node scripts/verify-exit-gate.mjs`) boots the real
   engine in headless Chromium.

CI runs these gates; the repo also has git hooks (`bun install` in `frontend/`
activates them). Do not bypass hooks with `--no-verify`.

## Non-negotiable project rules

1. **Local-first, no server.** No FastAPI/DB/auth. Compute stays on-device; the
   network is delivery-only (the signed bundle). The chart engine is zero-egress —
   the only outbound calls are the optional AI features a user explicitly opts
   into.
2. **Engine math lives in Python.** The TypeScript adapters *reshape*
   `SiderealChart → ChartData` only; never reimplement astrology in TypeScript.
3. **Determinism.** Same inputs → byte-identical chart on CPython and Pyodide.
   Pin `reference_date` in fixtures. Contract changes must pass the byte-parity
   gate.

## Pull-request expectations

- **Branch** off `main`; keep PRs focused and reasonably small.
- **Tests land with the code** they cover — bug fixes start with a failing
  regression test. Describe behavior, not implementation.
- **Write a clear description**: what changed, why, and how you validated it
  (include the live end-to-end check for user-facing changes).
- **Keep it local-first.** A PR that adds a server, an account system, a tracking
  call, or a font/asset CDN will not be accepted.
- **Conventional, descriptive commit messages** are appreciated
  (e.g. `feat(reading): …`, `fix(engine): …`).
- Be respectful — see the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Reporting security issues

Please do **not** open a public issue for security problems. See
[`SECURITY.md`](./SECURITY.md) for private reporting instructions.

## Questions

Open a GitHub issue, or reach the maintainer at
[harish.seshadri@gmail.com](mailto:harish.seshadri@gmail.com).
