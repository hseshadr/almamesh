# AlmaMesh Tech Stack

**Last Updated**: 2026-05-30

AlmaMesh is **local-first and shipped**: the astrology engine runs on the user's
device — in the browser, under Pyodide/WASM in a Web Worker — not on a server.
There is no backend API, database, cache, or auth. The network is used only to
deliver a signed, content-addressed bundle, after which the installable PWA works
offline.

## Overview

```
Engine:    Python 3.13 — deterministic sidereal calc (Skyfield + DE421 + Lahiri table)
Delivery:  edge-proc — signed (ed25519) content-addressed bundles, fail-closed
Browser:   Pyodide/WASM (shipped) — the same engine, in-tab Web Worker
Frontend:  React + Vite + TypeScript + Bun — local-first installable PWA (shipped)
LLM:       optional, client-side — any OpenAI-compatible endpoint, privacy-gated
Deploy:    static origin + CDN + PWA (no server)
```

## Engine (works today)

| Component | Technology | Notes |
|-----------|------------|-------|
| Language | Python | 3.13, managed with `uv` |
| Astronomy | Skyfield | sidereal positions from the DE ephemeris |
| Ayanamsa | Lahiri lookup table | shipped as a construct, not computed online |
| Validation | Pydantic | typed boundaries on every public surface |
| Packaging | hatchling wheel | the unit compiled into Pyodide for the browser |

The engine is pure and deterministic: identical inputs yield byte-identical
charts (verified across CPython and Pyodide).

## Delivery — edge-proc bundles

| Component | Technology | Purpose |
|-----------|------------|---------|
| Signing | ed25519 (raw 32-byte keys) | sign the construct manifest; pin the public key |
| Addressing | content-addressed chunks | immutable `/chunk/<hash>`, `/manifest/<hash>` |
| Verification | fail-closed | a bad signature or hash raises; never downgrades |
| Provenance | `almamesh_meta.json` | engine + ephemeris + ayanamsa versions per bundle |

Published via `almamesh-bundle`; consumed on-device. The origin is a plain
static directory — any web server or CDN serves it.

## Browser (shipped)

The same Python engine runs in the browser via **Pyodide** (WebAssembly), in a
Web Worker off the UI thread. The full chart computation is **byte-equal to
CPython** (asserted by an offline parity gate, `packages/browser` →
`test:parity`). The app (`@almamesh/browser`) syncs the signed bundle into OPFS,
verifies it ed25519+sha256 fail-closed, boots the unchanged `almamesh` wheel, and
computes in-tab — no server. It is an installable PWA (service worker), offline
after first load, with an in-app provenance footer showing the bundle's
engine/ephemeris versions. Birth-location lookup uses a bundled **offline
geocoder** (zero network).

## Frontend

| Component | Technology | Version |
|-----------|------------|---------|
| UI Framework | React | ^19 |
| Build Tool | Vite | ^6 |
| Language | TypeScript | ~5.7 |
| Package Manager | Bun | latest |
| Styling | Tailwind CSS | ^3.4 |
| State | Zustand | ^5 |

> The `frontend/` is a Bun-workspace monorepo: `@almamesh/{shared-types,
> constants,browser,store,llm}` plus `apps/web`. The Supabase auth + REST client
> are **gone**; the app is fully backend-free. See
> [`../frontend/README.md`](../frontend/README.md). Note: the engine's module
> Workers only resolve in a production build, so run the app with `bun run build
> && bun run preview`, not `vite dev`.

## LLM (optional, client-side)

Narration is never required to draw a chart. When enabled, `@almamesh/llm` calls
any OpenAI-compatible endpoint **directly from the browser** (local-model
default). Privacy is enforced client-side: a `local_only` egress gate fails
closed unless the endpoint is a loopback/private host, and chart payloads are
PII-redacted before any call (see the package's `egress`/`sanitize` tests). The
Python `llm.py` is retained only as the reference for this client-side port.

## Commands

```bash
# Engine + delivery (Python)
cd backend
uv sync --extra dev
uv run almamesh-chart "1990-01-15T12:00:00+00:00" 40.7128 -74.0060   # offline chart
uv run ruff check . && uv run mypy src/ && uv run pytest -q          # quality gate

# Frontend (the product — local-first PWA)
cd frontend && bun install
cd frontend/apps/web && ./scripts/setup-dev-assets.sh   # one-time: Pyodide dist + signed dev bundle
cd frontend/apps/web && bun run build && bun run preview # run end-to-end (NOT `vite dev`)
cd frontend/packages/browser && bun run test:parity      # Pyodide == CPython byte-parity gate
```

## Not using

| Technology | Reason |
|------------|--------|
| Any backend server / DB / cache | Local-first: compute on-device, no server |
| Accounts / auth | No sign-in; charts are computed, not stored remotely |
| GraphQL / REST API | There is no API to call |
