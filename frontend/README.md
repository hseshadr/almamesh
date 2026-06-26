# AlmaMesh frontend

**The whole product lives here.** This is a Bun-workspace monorepo whose app
(`apps/web`) is an installable PWA that computes Vedic charts **entirely in the
browser** — the deterministic engine is the unchanged Python `almamesh` package
run under Pyodide (WebAssembly) in a Web Worker. No backend, no accounts, offline
after the first load.

TL;DR for a cold start:

```bash
cd frontend && bun install
cd apps/web && ./scripts/setup-dev-assets.sh   # one-time: Pyodide dist + signed dev bundle (gitignored)
bun run build && bun run preview               # open the printed URL, generate a chart offline
```

> **Why build+preview, not `dev`?** The engine's module Workers (and the
> `pyodide` import in worker scope) only resolve in a real Rollup build. `vite
> dev` is fine for editing UI, but the *engine* only runs under `vite build` +
> `vite preview`. The live exit-gate test drives exactly that build.

## Layout

```
frontend/
├── package.json                Bun workspace root (workspaces: packages/*, apps/web)
├── tsconfig.base.json
├── scripts/generate-cities.mjs builds the offline geocoder city dataset
├── packages/
│   ├── shared-types/           UI-facing TS contract: ChartData, DashaData, etc.
│   ├── constants/              SINGLE design-token source (colors/typography/astrology) + Tailwind preset
│   ├── browser/                THE in-browser engine (see below)
│   ├── store/                  Zustand stores + the pure SiderealChart adapters
│   │                            (chart, chartGeometry, energy) + profiles store
│   └── llm/                    optional on-device LLM: WebLLM default + BYO endpoint
└── apps/web/                   the React + Vite + Tailwind PWA ("Observatory" UI)
    ├── scripts/setup-dev-assets.sh   regenerates the gitignored dev assets
    ├── scripts/verify-exit-gate.mjs  live headless-Chromium exit gate
    ├── src/data/cities.min.json      bundled offline geocoder dataset
    ├── src/components/ui/             design-system primitives (Button, Card, Tabs, …)
    ├── src/components/features/layout/  AppLayout shell + Header (profile switcher)
    ├── src/components/chart/          N/S Indian SVG kundli + ChartStyleToggle
    └── src/components/forcefield/     the 3D planetary force-field hero (three.js)
```

### Packages

| Package | Role |
|---------|------|
| `@almamesh/shared-types` | The UI contract (`ChartData` and friends). UI code depends on this, not on the engine's raw shapes. |
| `@almamesh/constants` | The **single design-token source** (colors, typography, astrology constants); also exports a Tailwind preset (`@almamesh/constants/tailwind.preset`). |
| `@almamesh/browser` | The in-browser engine. Bundle sync + Pyodide chart Worker + `AlmaMeshRuntime`. |
| `@edgeproc/browser` | **Vendored** copy of the edge-proc browser sync tier (signed-bundle sync into OPFS, ed25519 + sha256 fail-closed), from the `edge-reco` repo. Apache-2.0; see `packages/edgeproc-browser/VENDORED.md` for provenance + re-vendor policy. |
| `@almamesh/store` | Zustand stores + **pure** adapters, all reshape-only with **no astrology math**: `chart.ts` (`SiderealChart → ChartData`), `chartGeometry.ts` (`buildChartGeometry` → N/S kundli geometry), `energy.ts` (`buildEnergyFrame(chart, t)` → 3D force-field frame), plus the `profiles` store (named, password-less people; each owns its charts). |
| `@almamesh/llm` | Optional on-device narration + multi-turn chat. **Default engine is WebLLM** (`@mlc-ai/web-llm`, WebGPU, hardware auto-tiered) — zero setup, no key. A bring-your-own OpenAI-compatible HTTP endpoint (e.g. Ollama) is the power option. PII-redacted, fail-closed `local_only`, never required to draw a chart. |
| `apps/web` | The React/Vite "Observatory" PWA: UI primitives (`src/components/ui/`), `AppLayout` shell, N/S charts, and the `forcefield/` 3D hero. Self-hosted fonts (`@fontsource-variable/*`) — no font CDN. |

(`@almamesh/api-client` and `@almamesh/hooks` were deleted with the SaaS runtime.)

## How `@almamesh/browser` works

Two Workers, off the UI thread, driven by `AlmaMeshRuntime.bootstrap()`:

1. **Sync tier** — the edge-proc `EngineClient` (from `@edgeproc/browser/engine`,
   vendored at `packages/edgeproc-browser/`) pulls the **signed,
   content-addressed bundle** from a static origin, verifies it **ed25519 +
   sha256 fail-closed**, and materializes the DE421 ephemeris + the
   Skyfield/Pyodide/`almamesh` wheels into **OPFS**.
2. **Pyodide Worker** — `ChartEngineClient` boots Pyodide from the self-hosted
   dist, installs the wheels from OPFS, and calls the *same* Python entrypoint
   the CLI uses: `calculate_sidereal_context(dt, lat, lon, reference_date=...)`.
   The fixed `reference_date` pins the "current" Vimshottari dasha, which makes a
   chart reproducible byte-for-byte against CPython.

The Worker emits a `SiderealChart` (a TS mirror of the Python `SiderealContext`).
`@almamesh/store`'s adapter reshapes it into `ChartData` for the UI. After the
first bootstrap everything needed lives in OPFS, so reloads are offline.

> **No sibling checkout required:** `@almamesh/browser` resolves
> `@edgeproc/browser/engine` as a normal **workspace dependency** — the package
> is vendored into this repo at `packages/edgeproc-browser/` (Apache-2.0, see
> its `VENDORED.md` for the source commit and re-vendor policy). A fresh clone
> typechecks and builds with `bun install` alone.

## How `@almamesh/llm` works

The chart is computed without any AI; narration is opt-in. When you ask for an
interpretation or open the chat, the LLM router resolves a provider:

- **Default — WebLLM (on-device).** A WebGPU model from `@mlc-ai/web-llm` runs in
  the browser. `webllm/capability.ts` probes the device and `selectModelTier`
  picks a `MODEL_TIER_IDS` model (large/mid/small); the inference runs in a
  Worker (`webllm/engine.ts`, `webllm/worker.ts`). **First use downloads the
  model weights once from the MLC CDN**, then they are cached for offline reuse.
  No key, no setup — only a WebGPU-capable browser.
- **Power option — BYO endpoint.** Set `VITE_LLM_ENGINE=openai-http` (or supply a
  base URL/key) to point at any OpenAI-compatible server, e.g. a local Ollama at
  `http://localhost:11434/v1`.

Either way, the chart is run through `sanitizeChartForLlm` (PII-redacted) before
the prompt, and `ensurePrivacy` is **fail-closed**: a `local_only` request that
would leave the device throws rather than sending. Chat is multi-turn, with
history trimmed to a token budget (`trimHistoryToBudget`).

## Dev assets (`apps/web/scripts/setup-dev-assets.sh`)

The large runtime inputs are **gitignored** and regenerated by this script. Run
it once after a fresh clone (or whenever the bundle/Pyodide inputs change):

```bash
cd apps/web && ./scripts/setup-dev-assets.sh
```

It writes:

- `apps/web/public/pyodide/` — a self-hosted, offline Pyodide dist
- `apps/web/public/bundle/`  — a signed dev edge-proc bundle (origin layout)
- `apps/web/public/public.key` — the pinned ed25519 verify key for that bundle

It copies a Pyodide dist (override the source with `PYODIDE_DIST=/path/...`),
builds the `almamesh` wheel (`uv build --wheel`), and uses `almamesh-bundle`
(keygen + bundle) from `../../backend` to produce and sign the dev bundle.

## Commands

```bash
# Install (workspace root)
bun install

# Typecheck / lint everything
bun run --filter '*' typecheck
bun run --filter '*' lint

# Run the app end-to-end (engine needs a real build)
cd apps/web && bun run build && bun run preview

# Unit tests (Vitest)
cd apps/web && bun run test:unit
cd packages/store && bun run test
cd packages/llm && bun run test

# Byte-parity gate: Pyodide == CPython golden (boots ~38 MB Pyodide, offline)
cd packages/browser && bun run test:parity

# Live-browser exit gate: boots the real engine in headless Chromium, asserts
# no backend, no login, offline-capable, same-origin-only traffic.
# See the script header for the exact build+preview it expects, e.g.:
cd apps/web
VITE_API_URL= VITE_EXIT_GATE_HOOKS=1 ./node_modules/.bin/vite build --outDir dist-verify
VITE_API_URL= ./node_modules/.bin/vite preview --outDir dist-verify --port 4199 --strictPort &
node scripts/verify-exit-gate.mjs http://localhost:4199
# (one-time browser install: bunx playwright install chromium)

# Regenerate the offline geocoder dataset
bun run --filter @almamesh/web data:cities
```

## License

MIT — see [`../LICENSE`](../LICENSE).
