# Changelog

All notable changes to AlmaMesh are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project aims for
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-06-11

### Added
- **The mesh — relational astrology (the namesake feature).** Add the people
  close to you as **members** (typed relationships, each owning a full chart;
  persisted with a versioned migration, managed in **Settings → People**) and
  read the relationship between two whole charts. A new Python `almamesh.mesh`
  engine computes the classical **Ashtakoota Guna Milan** (36-point Melapaka,
  cited tables) and **Mangal (Kuja) dosha** screening (3-reference, with
  chart-computable cancellations), a two-way chart overlay, **daśā synchrony**
  over both dated trees, and shared house/kāraka significators — frozen into a
  read-only `MeshEdgeContext` per pair (neither chart is ever mutated by the
  other). Surfaces as the `/mesh` constellation and a `/mesh/:memberId` edge
  view: the marriage tables render **only on spouse/partner edges**; the
  compatibility band is labeled a *classical convention, never a verdict*; doshas
  are presented fear-free; and the engine's read-only promise is printed at the
  foot of every edge. The optional AI reading is **role-anonymized** (you and
  "your spouse" — no name ever leaves the device) behind an explicit anti-scam
  relationship fence.
- **Periods explorer + "The Road Ahead".** The predictive route gains a full
  **Periods** view (the 120-year Vimśottarī daśā tree, drillable maha → antar →
  pratyantar) and a **Road Ahead** timeline of upcoming windows.
- **"Sky & Timing" predictive superset.** A second on-device engine pass adds
  current transits (Gochara) + Sade Sati, dasha depth (antar/pratyantar), the
  full **D1–D60** divisional-chart set, **Ashtakavarga + Shadbala** planetary
  strength, and **per-life-domain forecasts** (career, finances, health,
  relationships, …) — same zero-egress, byte-identical determinism as the natal
  chart. Surfaces on a new `/predictive` route, a dashboard timing section, and
  report sections VI–IX.
- **Classical yoga engine + professional dashboard + birth-time sensitivity.**
  Yoga detection is rebuilt against cited classical rules with honest displays
  (on-screen formation traces and sources, qualitative grades, no invented
  combinations or percentages), the dashboard is reworked into a professional
  identity + insight surface, and near-cusp charts get an unmissable callout
  naming the alternative rising sign with a one-click path to rectification.
- **English, Spanish & Portuguese.** Offline-bundled i18n catalogs (zero
  egress, service-worker precached), a persisted language setting with
  `<html lang>` sync, locale-aware dates, and the optional AI narrates in the
  selected language. English is authoritative; es/pt are machine-translated
  pending native review.
- **Birth-time rectification panel.** Settings → Profile gains an editable
  birth time with a live Ascendant preview, cusp awareness, and a
  time-confidence field — refine an uncertain birth time and watch the Lagna
  respond before saving.
- **Print-first Vedic report (`/report`).** A dedicated, paper-themed,
  multi-page report route replaces the old "print the dashboard" path; the
  gated Export PDF includes the interpretation and the D9 Navamsa. Engine
  values render verbatim.
- **"Ask About Your Chart" chat.** Streaming multi-turn chat grounded in the
  deterministic engine's own numbers, persisted per profile, and searchable
  via in-browser RAG (self-hosted MiniLM embeddings — chat history never
  leaves the device).
- **Structured Vedic interpretation.** A five-section, schema-validated
  reading (generated client-side) populates the dashboard and astrologer-view
  cards; a lite prompt variant lets small local models render valid readings.
- **Profile CRUD.** Profiles can be renamed and deleted; deleting one
  cascades to its charts.
- **Engine: rigorous-precession Lahiri, plus True-Chitra ayanamsa and
  True-node options** (engine-level; the UI ships the Lahiri default).
- **External golden-reference validation.** The golden fixtures are checked
  against an independent astropy code path, with new boundary + hemisphere
  reference charts.
- **Vendored DE421 ephemeris.** The backend ships the JPL DE421 kernel —
  charts compute offline from a clean clone with no download step.
- **Turnkey demo.** `uv run poe demo` (or `make demo`) installs, signs a dev
  bundle, builds, and opens the PWA in one command.
- **Distinct "engine warming" onboarding message.** The first-load chart path now
  surfaces a separate, retryable warming state instead of a generic error while
  the Pyodide engine boots.
- **Gitleaks secret-scan CI job.** Pushes and PRs are scanned for committed
  secrets.
- **Husky pre-push guard.** Pushes run lint + typecheck locally before they
  can reach `main`.

### Changed
- **The repo is now fully self-contained — a single `git clone` builds
  everything.** The three formerly-private dependencies are vendored in-tree
  with provenance, licenses, and a re-vendor policy (`VENDORED.md` in each):
  `backend/vendor/edge-proc`, `backend/vendor/shared-libs-python`, and
  `frontend/packages/edgeproc-browser` (`@edgeproc/browser`, now a regular Bun
  workspace package). CI runs every job from the single checkout — the
  `PORTFOLIO_PAT` secret, the private-sibling checkout/patch/symlink steps, and
  the pnpm toolchain it dragged in are gone, and the vendored suites are new
  gates (the edge-proc pytest suite; `@edgeproc/browser` typecheck + vitest).
  The `scripts/fetch-deps.sh` helper is deleted — there is nothing left to
  fetch.
- **Renamed `OnDeviceModelSettings` → `AiModelSettings`** and corrected stale
  "on-device WebLLM by default" copy: the default is the OpenRouter / BYO
  OpenAI-compatible cloud preset; the in-browser WebLLM engine ships dormant.
- **Yoga engine now fails loud.** A malformed yoga rule raises a typed
  `YogaRuleError` instead of being silently dropped.
- **Tiered LLM defaults.** Chat runs on a fast model that reuses the
  frontier-generated reading; interpretation keeps the deeper default — one
  shared OpenRouter / BYO OpenAI-compatible preset configures both.
- **Legal pages rewritten truthfully** for a no-account, local-first app (the
  old copy described accounts and registration that do not exist); shown with
  a machine-translation disclaimer outside English.

### Fixed
- **Engine: timezone-aware birth datetimes are converted — not relabeled — to
  UTC.** A `06:44+05:30` birth was previously treated as `06:44 UTC` by the
  offline CLI / standalone engine (the browser path already passed UTC);
  regression-tested across six offsets.
- **Engine: apparent positions + true obliquity of date** replace mean values.
- **OpenRouter LLM is now selectable and discoverable.** A dedicated
  `/settings/ai` tab plus a live header AI-status badge that links to it; the
  "Use OpenRouter" preset is promoted to the primary action.
- **Print/PDF birth header rendered the wrong date for near-midnight,
  non-UTC births.** The report header is now timezone-safe.
- **Settings rendered the birth date rolled back a day in some timezones**;
  it now shows the birth-local date.
- **Interpretation no longer fails silently on a retired model id** — it
  self-heals to a live default and surfaces the real provider error body; the
  generation timer shows honest elapsed time.
- **"Current Life Phase" card** populates from the engine's dasha sequence.
- **The 3D force-field fetched its text font from a CDN** — fonts are now
  self-hosted, restoring the zero-egress guarantee (a live exit-gate check
  pins it).
- **Stop tracking `*.tsbuildinfo` build artifacts** (generated, never tracked).

### Removed
- **Dead SaaS-era harness swept.** Deleted the Playwright / Supabase-auth test
  harness, the orval API codegen, and the deprecated Supabase / OAuth error
  cases.
- **Retired SaaS architecture diagrams deleted** (`docs/diagrams/`): the
  OAuth/Postgres/FastAPI-era C4, sequence, activity, and endpoint-map set
  described the deleted server; they remain in git history.

## [0.2.0] - 2026-05-31

### Added (observatory UI overhaul — the in-browser product surface)
- **Professional "observatory" UI.** A single design-token source
  (`@almamesh/constants` → generated Tailwind theme), a set of accessible UI
  primitives, an app shell, and self-hosted variable fonts (no font CDN — keeps
  the app zero-cross-origin and fully offline).
- **Degree-accurate North & South Indian charts.** Both classic kundli styles
  render off a pure `buildChartGeometry(SiderealChart)` adapter, with a style
  toggle, a rich planetary table, and 2D⇄3D planet cross-highlight.
- **3D planetary force-field hero.** Planets at their real ecliptic longitude
  exert animated force-beams on a lagna-tinted core (interference-driven aura),
  driven by a pure `buildEnergyFrame` adapter. Replaced and deleted the old
  dasha-timeline 3D helix.
- **Optional LLM interpretation + chat.** Interpretation and multi-turn chat run
  against a bring-your-own OpenAI-compatible endpoint — a one-click OpenRouter
  cloud preset by default, or any local endpoint (e.g. Ollama) — all PII-redacted
  and fail-closed `local_only`. (An in-browser WebLLM engine ships dormant in the
  tree, disabled in this build and kept for a future re-enable.)
- **Named profiles for a shared device.** Multiple people share one laptop with
  no passwords; each profile owns its charts; password-less switcher in the
  header; existing charts migrate into a default profile with no data loss.
- **D9 Navamsa divisional chart.** The deterministic engine now computes the
  Navamsa (canonical BPHS rule) and renders it in either kundli style; emitted
  additively so the D1 chart stays byte-identical (CPython↔Pyodide parity holds).

### Added (local-first / edge-proc)
- **AlmaMesh is now an edge-proc consumer.** The deterministic chart core is
  wrapped as a `ChartRuntime` (`almamesh/edge/`) that accepts a `LOCAL_ONLY`,
  `DETERMINISTIC` task and returns the full sidereal chart on-device; failures
  are encoded in the result envelope, never raised.
- **Signed content-addressed construct delivery.** The Lahiri ayanamsa table is
  published as a signed bundle and synced with fail-closed ed25519 verification
  against a pinned trust root (almamesh.com is delivery-only; compute stays
  local).
- **Offline `almamesh-chart` CLI** + `examples/run_chart.sh`: birth data to a
  deterministic chart with no network, account, or API key.
- **Bundle publisher (`almamesh-bundle` CLI).** `keygen` mints a raw ed25519
  keypair (private key written owner-only `0o600`, never silently overwritten;
  public key pinned into the SPA); `bundle` signs the engine constructs (Lahiri
  table + yoga rules), a provenance `almamesh_meta.json` (engine version,
  ephemeris file, ayanamsa, construct list), and any staged binaries
  (ephemeris/wheels) into a content-addressed origin a device can sync.
  Staging rejects symlinks, out-of-tree escapes, and names that collide with
  signed constructs — a published bundle can never smuggle or shadow a file.
- **`EPHEMERIS_FILE` setting** records which ephemeris a bundle ships; it is kept
  in lockstep with the engine default `calculations.DEFAULT_EPHEMERIS_FILE`.

### Changed (browser engine prep — P2)
- **Default ephemeris is now DE421 (~16 MB), down from DE440 (~114 MB).** The
  smaller kernel is the shippable in-browser payload and is accurate across the
  1900–2050 range AlmaMesh targets; the parallel ground-truth validator was moved
  to DE421 in lockstep and the full validation suite stays green.
- **Chart output is reproducible: injectable `reference_date`.** The "current"
  Vimshottari maha dasha is the period containing a reference instant.
  `calculate_sidereal_context(..., reference_date=...)` and the `ChartRuntime`
  payload key `reference_date` (ISO 8601) now make that instant explicit; omitting
  it falls back to the wall clock. Pinning it makes a chart a pure function of
  (birth data, reference date) — required for CPython↔Pyodide byte-parity and the
  deterministic session version-lock.

### Removed (local-first pivot)
- **The SaaS runtime is gone.** The browser now runs the engine on-device, so
  the FastAPI server, Supabase auth, SQLAlchemy/Postgres, Redis cache, rate
  limiting, and all HTTP routers were deleted (≈6.7k LoC), along with the deps
  they pulled in (`fastapi`, `uvicorn`, `sqlalchemy`, `asyncpg`, `alembic`,
  `redis`, `PyJWT`, `slowapi`, and the unused `litellm`). The backend is now
  the deterministic engine + the edge-proc delivery layer; the LLM
  sanitization logic and predictive schema are retained as the reference for
  the in-browser TypeScript port.
- **Dead SaaS artifacts swept project-wide.** Deleted the deploy/infra that
  targeted the removed server — `render.yaml`, root `docker-compose.yml`,
  `backend/Dockerfile`, Alembic migrations, `scripts/setup_auth.py`, the
  database debug script — plus unwired BDD `.feature` files and the unused
  `pytest-bdd` dev dep. Deleted specs documenting the deleted SaaS backend
  (REST API, DB schema, auth migration, backend parity/stability).
- **Real PII removed from tests.** A committed name + birth data became an
  anonymous "Reference Chart" fixture (golden astronomical values unchanged).
- **Server-style Python LLM scaffolding deleted.** The cloud/server-era LLM
  port-reference is gone: `almamesh/llm.py`, the `almamesh/predictive/` package
  (canonical schema + claim generator), `almamesh/constants/llm.py`, the cloud
  `Settings` fields (`OPENAI_API_KEY`, `OPENROUTER_*`, `LITELLM_*`,
  `LLM_API_BASE`, `LLM_PRIVACY_MODE`), the `pydantic-ai` `[llm]` optional
  dependency (and its `almamesh[llm]` `dev` reference), and their tests. The
  only LLM in the product is now the in-browser `@almamesh/llm` (WebLLM / BYO
  OpenAI-compatible). The backend is purely the deterministic engine + the
  edge-proc bundle publisher. (`pyyaml`, previously satisfied transitively via
  the LLM stack, is now a declared core dependency — the yoga-rules engine needs
  it.)
- **Dead CI removed / reworked.** Deleted the `e2e.yml` workflow (it booted the
  removed FastAPI server). The backend test job now also runs `mypy src/`; the
  frontend job builds package declarations in dependency order before the
  workspace typecheck (fixes a clean-checkout `tsc` project-reference race).

### CI note
- Backend CI installs the unpublished `edge-proc` / `shared-libs-python` (local
  path sources) by checking the private siblings out into `.deps/` and patching
  the uv path sources before sync (mirrors edge-reco). Needs a `PORTFOLIO_PAT`
  secret with read access until `edge-proc` ships to PyPI (M5).

### Documentation
- **README rewritten for local-first.** Lead TL;DR + a one-command offline-chart
  quickstart (`almamesh-chart`), the bundle-publish flow, an architecture map,
  and an honest status/roadmap (engine + CLIs work; browser UI in progress).
- **`docs/tech-stack.md` rewritten** to the local-first stack (Python engine →
  Pyodide, edge-proc signed delivery, static origin) — dropped the
  FastAPI/Postgres/Redis/Supabase/Render framing.

### Fixed
- **Dasha-year convention is now declared and applied uniformly.** Mahadasha
  duration previously used a 360-day year while Antardasha, Chara, and Yogini
  periods used 365.25 — a silent, mixed convention that drifted sub-period
  timing. A single `DashaYearConvention` (`dasha/convention.py`) is now the one
  source of truth; antardashas are derived as exact fractions of their
  mahadasha's span, so they tile it with no overhang under any convention.
  `reconcile_vimshottari` exposes all three conventions side-by-side.
- **Pratyantardasha (3rd-level Vimshottari) is now populated.** `pd_lord` was
  consumed by signal extraction but never set; the active state now names it,
  derived as an exact fraction of the antardasha span.

### Changed
- Dropped the unused AGPL `pyswisseph` dependency (Skyfield over public-domain
  JPL ephemerides is the sole astronomy path).

### Added
- MIT `LICENSE`.
- `.env.example` documenting every backend environment variable.

## [0.1.0]

- Initial functional prototype: deterministic sidereal chart engine
  (lagna, planets, Whole Sign houses, nakshatras), composite dasha engine
  (Vimshottari + Jaimini Chara + Yogini), YAML-driven yoga detection, and a
  fenced-off LLM interpretation layer.
