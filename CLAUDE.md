# CLAUDE.md - AlmaMesh

AlmaMesh is a free, every-OS, anti-scam Vedic astrology app that runs **entirely
in the browser, local-first** — no backend, no accounts, no login, offline after
first load. The deterministic chart engine is the unchanged Python `almamesh`
package run under Pyodide (WebAssembly) in a Web Worker; it is byte-identical to
CPython. The React/Vite app is an installable PWA. The Python side is now a
**build-time bundle publisher** (the `almamesh-bundle` CLI) plus the engine — it
does NOT run as a server.

> **Generic engineering defaults live in the global `~/.claude/CLAUDE.md`** —
> use-tools/skills-first, **superpowers parallel agents by default** (one message,
> crisp contracts; delegate the validation loop too), library-first, **TDD**,
> **validate-end-to-end in the running app**, typed contracts, no dead code. This
> file is **only the AlmaMesh-specific** context below.

---

## Project skills & agents

Invoke skills via the `Skill` tool; launch agents via `Task` with `subagent_type`.
(Serena MCP for semantic code nav/edit and the `MCP_DOCKER` browser for live
verification are also available — prefer them over grep / manual coding.)

| Skill | Trigger |
|-------|---------|
| `almamesh-backend` | Python engine + bundle publisher: sidereal calculations, dasha, yogas, signed bundle CLI |
| `almamesh-frontend` | React/TypeScript: components, styling, state, in-browser engine wiring |
| `testing` | Running tests, debugging failures, test infrastructure |
| `deployment` | CI/CD, env vars, cloud deployment |
| `frontend-design` | High-quality UI design and implementation |

| Agent | Use For |
|-------|---------|
| `code-quality-backend` | Python validation: ruff, mypy, pytest |
| `code-quality-frontend` | TypeScript validation: ESLint, type checks |
| `architecture-advisor` | System design, D2 diagrams, trade-offs |
| `Explore` / `Plan` | Codebase exploration / implementation planning |
| `github-actions-agent` | CI/CD, PRs, workflow runs |

---

## Tech Stack

There is **no server**. The Python package is the deterministic engine and the
build-time bundle publisher; the browser app is the entire product surface.

| Layer | Tech | Version/Notes |
|-------|------|---------------|
| Engine | Python 3.13 `almamesh` pkg | Pydantic models; `uv` deps; runs on CPython AND under Pyodide (byte-identical) |
| Astronomy | Skyfield + DE421 ephemeris | Sidereal; Lahiri ayanamsa default, True-Chitra + True-node selectable; injectable `reference_date` for reproducibility; externally validated against astropy + JPL Horizons (sub-arcsecond, no Swiss Ephemeris) |
| Bundle publisher | `almamesh-bundle` CLI | Build-time: assembles + ed25519-signs a content-addressed edge-proc bundle (de421 + skyfield/pyodide wheels + almamesh wheel + provenance meta) |
| In-browser engine | Pyodide (WASM) in a Web Worker | `@almamesh/browser` — syncs the signed bundle into OPFS, boots the unchanged wheel, computes charts off the UI thread |
| Frontend | React + Vite + Tailwind CSS | Bun workspace monorepo; installable PWA (vite-plugin-pwa + service worker), offline after first load |
| LLM (optional) | Client-side, OpenAI-compatible | `@almamesh/llm` — OpenRouter / BYO OpenAI-compatible by default (one-click preset; WebLLM dormant), PII-redacted, fail-closed `local_only`; never required to draw a chart |
| State | Zustand | Persisted stores (`@almamesh/store`) |
| i18n | react-i18next | Offline bundled en/es/pt catalogs (`apps/web/src/locales/*`, static-imported + SW-precached, zero-egress); persisted language Zustand store (`@almamesh/store` `useLanguageStore`) + `<html lang>` sync; AI narrates in-language; en authoritative, es/pt machine-translated |
| Tests | Vitest (unit) + Playwright (live-browser exit gate) | |

### Frontend monorepo packages (`frontend/packages/*`)

| Package | Role |
|---------|------|
| `@almamesh/shared-types` | UI-facing TS contract (`ChartData`, etc.) |
| `@almamesh/constants` | Single design-token source (colors/typography/astrology) + Tailwind preset |
| `@almamesh/browser` | In-browser engine: edge-proc bundle sync (OPFS) + Pyodide chart Worker + `AlmaMeshRuntime` |
| `@almamesh/store` | Zustand stores + pure adapters: `chart` (`SiderealChart → ChartData`, incl. the D9 Navamsa `varga_ctx`), `chartGeometry` (`buildChartGeometry` → N/S kundli, `buildVargaGeometry` → D9), `energy` (`buildEnergyFrame(chart, t)` → 3D force-field), `profiles` store (rename/delete with chart cascade) + **`members`** (typed relationships, persist-v1 migration) and **`mesh`** (per-pair `MeshEdgeContext` from `compute_mesh`, read-only) |
| `@almamesh/llm` | Interpretation + multi-turn chat: **OpenRouter / BYO OpenAI-compatible endpoint by default** (one-click preset, `cloud_premium`, one shared model for interpretation + chat); WebLLM (`@mlc-ai/web-llm`) dormant/hidden; PII-redacted, fail-closed `local_only` for local endpoints. **Mesh narration** (`mesh-reading`/`mesh-facts`/`mesh-sanitize`): role-anonymized pair sanitizer (no names leave the device) + 3-section `streamMeshReading` behind the **ANTI-SCAM RELATIONSHIP FENCE** (band = convention, never a verdict) |
| `apps/web` | The React/Vite "Observatory" PWA: UI primitives (`components/ui/`), `AppLayout`, N/S charts, `forcefield/` 3D hero, self-hosted fonts (no CDN) |

(`@almamesh/api-client` and `@almamesh/hooks` were DELETED with the SaaS runtime.)

---

## Commands

```bash
# Engine + bundle publisher (Python)
cd backend && uv sync --extra dev && uv run pytest -q
cd backend && uv run ruff format . && uv run ruff check --fix . && uv run mypy src/
cd backend && uv run almamesh-chart "1990-01-15T12:00:00+00:00" 40.7128 -74.0060   # offline chart, no frontend
cd backend && uv run almamesh-bundle keygen ./keys                                  # sign a bundle

# Turnkey demo (from the repo root): install + dev assets + build + open the PWA
uv run poe demo                                          # http://localhost:4173 (poe demo-fresh re-signs the bundle)

# Frontend (Bun workspace)
cd frontend && bun install
cd frontend/apps/web && ./scripts/setup-dev-assets.sh   # one-time: fetch Pyodide dist + sign a dev bundle (gitignored)
cd frontend && bun run --filter '*' typecheck
cd frontend/apps/web && bun run test:unit               # Vitest

# IMPORTANT: the engine's module Workers only resolve in a production BUILD,
# not `vite dev`. To run/verify the app end-to-end:
cd frontend/apps/web && bun run build && bun run preview   # open the previewed URL

# Live-browser exit gate (boots the real engine in headless Chromium)
cd frontend/apps/web && node scripts/verify-exit-gate.mjs   # see script header for the build+preview it expects
# Pyodide==CPython byte-parity gate:
cd frontend/packages/browser && bun run test:parity
```

---

## Rules (project-specific — the global engineering defaults also apply)

1. **Local-first, no server** — No FastAPI/DB/auth. Compute stays on-device; the network is delivery-only (signed bundle).
2. **Engine math lives in Python** — The TS adapter RESHAPES `SiderealChart → ChartData` only; never reimplement astrology in TypeScript.
3. **Determinism** — Same inputs → byte-identical chart on CPython and Pyodide. Pin `reference_date` in fixtures.

(On top of these: the global defaults — tools/skills-first, parallel superpower
agents, library-first, minimal code, TDD, type-safety, test-always, no dead code.)

---

## Data Contract (no API; it's a transform + signed bundle)

There is no HTTP API. The "contract" is the in-process chart pipeline plus the
signed bundle layout the browser syncs:

```
Python  calculate_sidereal_context() -> SiderealContext   (backend/src/almamesh/)
   │  same entrypoint runs under Pyodide, byte-identical
   ▼
TS engine  SiderealChart                                   (@almamesh/browser, ./pyodide/chart)
   │  pure reshape + timezone only — NO astrology
   ▼
store adapters (pure, NO astrology)                        (@almamesh/store, src/adapters/)
   ├─ chart.ts        SiderealChart -> ChartData           (the UI contract; incl. D9 varga_ctx)
   ├─ chartGeometry.ts buildChartGeometry(chart)           (N/S kundli geometry; + buildVargaGeometry for D9)
   ├─ energy.ts       buildEnergyFrame(chart, t)           (3D force-field frame)
   └─ predictive.ts   reshape PredictiveContexts           (transits/vargas/strength/domains -> UI)
   ▼
UI  ChartData / shared-types                               (@almamesh/shared-types)

Predictive layer (the "Sky & Timing" surface, computed on-device, off the natal
chart path): a lazy second engine entry `edge/chart_runtime.py::compute_predictive`
-> `predictive.py::compute_predictive_contexts` emits transits/Gochara, dasha depth
(antar/pratyantar), all 16 vargas D1–D60, Ashtakavarga + Shadbala, and per-life-domain
forecasts. It flows through `@almamesh/browser` (pyodide/predictive.ts) ->
`@almamesh/store` (adapters/predictive.ts + the `usePredictiveStore`) -> shared-types
-> the `/predictive` route, the dashboard timing section, and report sections VI–IX.
Same determinism + byte-parity rules apply (transit + predictive golden fixtures).

Mesh layer (the relational surface, computed on-device, off the natal chart path):
a lazy engine entry `edge/chart_runtime.py::compute_mesh` ->
`mesh/edge.py::compute_mesh_edge(a, b, relationship) -> MeshEdgeContext` — relations
BETWEEN charts, never mutations of either natal chart. It flows through
`@almamesh/browser` (pyodide/mesh.ts) -> `@almamesh/store` (adapters/mesh.ts +
`useMeshStore.ensureMeshEdge`) -> shared-types -> the `/mesh` constellation and
`/mesh/:memberId` edge view. Sections are CURATED BY RELATIONSHIP: Ashtakoota +
Mangal are marriage tables (spouse/partner edges only); friend/family/business
edges lead with Graha Maitri — `scripts/verify-mesh.mjs` asserts both paths live.

Rectification layer (the birth-time authority surface, computed on-device, off the natal
chart path): a lazy engine entry `edge/chart_runtime.py::compute_rectification` ->
`rectification/` package -> `compute_rectification_result` emits `RectificationResult`
(ranked `RectificationCandidate` list, qualitative `RectificationBand` per result,
per-event `EventEvidence` table). Two modes: `cusp` (2 adjacent signs near a cusp,
~sub-second) and `window` (unknown/rough time, full-day scan with warm-astronomy reuse,
~0.6s). Ascendant-dependent signals: dasha-lord↔house-lordship match + transit-to-house
at event dates. Honest confidence: margin→band, min-evidence gate forces `near_tie`,
de-correlation caps stacked same-category events; no headline %. Engine computes; the
LLM only optionally structures. It flows through `@almamesh/browser`
(pyodide/rectification.ts, `ChartEngine.computeRectification`) -> `@almamesh/store`
(adapters/rectification.ts reshape + transient `useRectificationStore`; extended
`lifeEvents` store with date+category+persist-v1 migration) -> shared-types
(`RectificationResult`/`RectificationCandidate`/`EventEvidence`/`LifeEventCategory`/
`RectificationMode`/`RectificationBand`) -> the `/rectify/:profileId` wizard (3 entry
CTAs: onboarding unknown-time, ProfileSettings panel, dashboard cusp callout). Confirm
routes through the existing birth-info-changed→regenerate pipeline so the rectified time
becomes the working authority. Optional `@almamesh/llm` `structureLifeEvents` +
`RECTIFICATION_FENCE` (structure-only, typed `{date, category}` output = privacy
boundary; LLM never sees event narrative). Same determinism + byte-parity rules: pin
`reference_date`; Pyodide==CPython parity gate covers the new entry; golden fixtures use
synthetic natives only (no real birth data).

Optional interpretation + chat (off the chart path): @almamesh/llm — OpenRouter /
BYO OpenAI-compatible endpoint by default (one-click preset, one shared model;
WebLLM dormant/hidden). PII-redacted, fail-closed local_only for local endpoints.
The chart engine is zero-egress; the only outbound requests are the optional AI
calls the user opts into (to the configured endpoint). NOTE: the engine emits the
full D1–D60 varga set; the adapter populates `varga_ctx` (D9 Navamsa rendered in
both kundli styles + the print report, D1–D60 in the predictive "Divisional Charts"
tab) and the predictive contexts above.

Dual-voice reading (shipped in feat/dual-voice-life-atlas): `VedicInterpretation.summary`
is now a `Persona { layman: string; technical: string }` instead of a plain string —
`personaText(summary, audience)` selects the voice at the render boundary so toggling
"For You"/"For Astrologer" switches the headline without a new LLM call. The Life Atlas
(`LifeAtlas.tsx`) and Sky & Timing panel both use `usePredictiveLayer({ auto: true })`,
auto-starting the ~30s predictive compute the moment engine + chart are ready (no manual
button); the single Pyodide engine thread services chart + predictive calls sequentially,
so any concurrent engine use (e.g. rectification live preview) must wait its turn.

Signed bundle (delivery):  ed25519-signed, content-addressed origin
   de421.bsp + finals2000A.all + pyodide/skyfield/almamesh wheels + provenance meta
   published by  almamesh-bundle  ->  synced into OPFS by  @almamesh/browser
```

When changing the contract: update the Python model → update `SiderealChart` →
update the store adapter → update `@almamesh/shared-types` → run the byte-parity
gate (`test:parity`) and the live exit gate.

---

## Quality Gates (Non-Negotiable)

All changes must pass before completion:
- `uv run pytest` — engine tests pass (incl. DE421 golden-parity fixture)
- `uv run ruff check .` + `uv run ruff format --check .` — clean, formatted
- `bun run --filter '*' typecheck` — frontend types clean
- `bun run test:unit` (Vitest) green; the Pyodide==CPython `test:parity` gate green
- The app **builds and previews** (`bun run build && bun run preview`) — remember module Workers do NOT run under `vite dev`
- **Validate end-to-end live** (the global non-negotiable): drive the built+previewed app and observe every touched journey (reachable + correct on screen + clean console). AlmaMesh specifics: module Workers need a **production build**; the `MCP_DOCKER` browser **cannot boot the engine** — use the project's Playwright Chromium / the live exit gate; browser-in-Docker reaches the host as `http://host.docker.internal:<port>`. Run the live exit gate after backend/bundle/chunk changes. (Two scars that shipped CI-green: an OpenRouter selector with no reachable UI, and a timezone bug in the print header — hence "reachable + correct on the actual screen," not just a green unit test.)
- **Drive the REAL `make demo` artifact through REAL onboarding — the hooked exit gate is necessary but NOT sufficient.** The `verify-*.mjs` gates build with `VITE_EXIT_GATE_HOOKS=1` and seed the chart via the `window.__almameshGenerate` hook, which **bypasses the actual onboarding → engine-bootstrap → Generate → dashboard journey**. A green hooked gate has shipped a broken real path. So before claiming any user-facing change works: build **without** hooks (`bun run build`, or `wrangler pages dev dist` for closest-to-prod) and drive the real UI in the project's Playwright Chromium — type name + birth date/time, search & select a city, click **Generate**, **WAIT for the ~38 MB engine bootstrap to finish**, and confirm a chart renders on `/dashboard` with a clean console. Also exercise the **unhappy boot paths** — a throttled/slow bootstrap and a failed/stale bundle — and confirm the user can **recover in-app** (re-bootstrap / "Reset & reload"), never a dead-end "engine still warming up" card. **Engine-recovery invariant:** the in-browser bootstrap is RETRYABLE (`AlmaMeshRuntimeProvider` exposes `reboot()`/`whenReady()`) and every "engine not ready" surface must offer in-app recovery — never leave a returning visitor permanently stuck. (Scar 2026-06-19: an "immaculate" pass shipped with the hooked exit gate 8/8 green while the real onboarding was permanently stuck on "Connection Issue" — a fire-once `useEffect([])` bootstrap with no retry.)
