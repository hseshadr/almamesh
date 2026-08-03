# Changelog

All notable changes to AlmaMesh are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project aims for
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **The PDF export is now actually deterministic.** `README.md` has told readers
  the export is "deterministic (same input, same file every time)" for months and
  it was **false**. Measured on 2026-08-03: two exports of one chart, both
  129,913 bytes, SHA-256 `0e23f0f4…` vs `fbabb738…`, first differing byte at
  offset 8413, 37 differing runs / 179 bytes. Three causes, largest first.
  **(1) Random font subset tags — 30 of the 37 runs, across 8 faces.**
  `@react-pdf/pdfkit` picks each embedded font's six-letter prefix with
  `Math.random()` in `EmbeddedFont.embed()`, with no way to seed it. New seam
  `frontend/apps/web/src/lib/reportPdfDeterminism.ts` rewrites those tags after
  serialization to a value derived from the font's own PostScript name. The
  rewrite is length-preserving, so every xref byte offset stays valid, and it
  matches only `/FontName` and `/BaseFont` (pdfkit compresses stream *data*, not
  dictionaries, and writes no object streams, so no tag hides behind a filter).
  PDF 32000-1 §9.6.4 makes the tag arbitrary, so nothing a reader can observe
  changes. **(2) A wall-clock `/CreationDate`.** `ReportDocument.tsx` never
  passed the `creationDate` prop that @react-pdf already supports, so it
  defaulted to `new Date()`; `buildReportPdfData.ts` separately stamped the cover
  with `formatReportDate(new Date())`. Both now come from ONE instant — the
  chart's own `astronomical_calculations.calculation_timestamp` — threaded as a
  required, nullable `generatedAt` so no call site can quietly reach for the
  clock again. A chart that records no instant prints no date and stamps the
  epoch, rather than inventing one. **(3) The trailer `/ID`** needed no separate
  fix: pdfkit derives it from an MD5 over the info dictionary, so pinning
  `/CreationDate` pins it.

  Nothing had ever byte-compared two renders. `renderToBytes.test.tsx` asserted
  only `buf.length > 1000`, which passes at any content. Two new suites close
  that: `__tests__/deterministicExport.test.tsx` (two renders, identical object
  bodies, identical subset tags, `/CreationDate` pinned to a literal, stable
  `/ID`) and `lib/__tests__/reportPdfDeterminism.test.ts` (the rewriter's own
  properties). The whole-file SHA-256 comparison lives in
  `e2e/report-pdf.e2e.spec.ts`, which exports the same chart twice from a real
  Chromium *with the page clock moved on by a second between exports* — freezing
  it would have let a clock-reading export pass. It has to be the browser: Node's
  pdfkit build deflates through async `zlib.createDeflate()`, so its object write
  order varies between runs; the shipped browser build is single-threaded pako.

  One real bug fell out of writing those tests. The first cut of the rewriter used
  `TextDecoder('latin1')`, which is an Encoding-Standard alias for **windows-1252**:
  bytes 0x80–0x9F decode to printable code points (0x80 → U+20AC) and re-encode to
  something else, silently corrupting any deflated stream containing them. The
  "leaves every non-tag byte untouched" test caught it before it shipped.

- **`verify-report-pdf.mjs` can no longer pass by skipping its own verification.**
  The script rasterizes every PDF page to a PNG — that *is* the verification — and
  when `pdftoppm` was absent it printed "PDF written, PNGs skipped" and exited 0.
  It now preflights the binary before launching Chromium and exits 1 with install
  instructions, fails if rasterization errors, and fails if `pdftoppm` exits 0
  having written no PNGs (proven with a stub rasterizer: exit 1, was exit 0).
  Console errors during the flow now fail the run too, instead of being printed
  under a green exit. `pdftoppm`/`pdftotext` were undeclared binary dependencies;
  `CONTRIBUTING.md` now names poppler where a contributor will look.

### Added
- **`bun install` now refuses packages published in the last 24 hours.** That
  window is when a compromised or hijacked release is live and still undetected.
  The sibling frontends in this portfolio have enforced a 24h cooldown for a
  while via pnpm's `minimumReleaseAge: 1440`, but AlmaMesh uses bun and bun ships
  the control *disabled* by default — so this repo had no release-age gate at
  all. Not a decision, just a different package manager. Demonstrated on
  2026-08-03: `@edgeproc/errors@0.1.0` (published 13:54Z) was refused by
  aml-filter's pnpm gate and installed here 90 minutes later without a word.
  The new `frontend/bunfig.toml` sets `install.minimumReleaseAge = 86400` —
  **seconds**, bun's unit, where pnpm counts minutes; 86400s is the same 1440
  minutes, and writing `1440` here would be a 24-*minute* cooldown that still
  looked right next to the pnpm files. Proven refusing a real too-fresh package
  rather than assumed: `bun add baseline-browser-mapping@2.11.11` (published
  23.7h earlier) exits **1** with `error: No version matching
  "baseline-browser-mapping" found for specifier "2.11.11" (blocked by
  minimum-release-age: 86400 seconds)` and writes nothing, while `@2.11.10`
  installs at exit 0 — and the same fresh version installs at exit 0 once the
  config is removed, so the refusal is the gate, not the package. Scope is
  stated rather than implied: it gates *resolution*, so versions already pinned
  in `bun.lock` are not re-checked, and a package already in bun's global cache
  is served from cache and skips the check (CI installs cold). Deleting the key,
  deleting the file, slipping the unit to `1440`, or adding a
  `minimumReleaseAgeExcludes` carve-out each fail
  `apps/web/src/__tests__/supply-chain-cooldown.test.ts`; all four mutations were
  watched going red.

### Changed
- **`@edgeproc/errors` now comes from npm instead of a vendored copy.** The
  library was published as `@edgeproc/errors@0.1.0`, so
  `frontend/packages/edgeproc-errors` (a 509-line snapshot pinned to upstream
  commit `7705a72`) is deleted and `apps/web` depends on `^0.1.0` like any other
  package. No behaviour change: the published catalog is a strict superset of
  the vendored one — same 18 codes, same registration order, same HTTP statuses,
  same English text — verified by a 222-check differential run across
  `classify` / `describe` / `httpStatusOf` / `errorNameOf` / `errorTextOf` and
  every code, with zero diffs. The library enters the app through the single
  seam `apps/web/src/lib/errors.ts`, which is unchanged apart from a comment.
  The library's own 48 tests move upstream to `hseshadr/errors` (now 114 tests
  across 13 files, with its own CI); AlmaMesh keeps its 43 consumer tests.

### Fixed
- **The exported PDF dropped the AI interpretation the app was still showing you.**
  `ReportView` gated the export on `status === 'complete'`, but a natal-only
  reading's status is downgraded to `'idle'` the moment the predictive layer
  computes (its `inputProvenance.predictiveRequestKey` is `null`, which stops
  being "current" once predictive facts exist). The dashboard kept rendering that
  same reading from the permissive `interpretation` value, so screen and export
  disagreed about a document the user could see. Both now read the one stored
  value; there is no third state left for them to disagree about. Regression test:
  *"exports the narrative the screen is showing, even after predictive turns the
  status stale"*.
- **Export PDF asked you to do things first.** The dashboard button was
  `disabled` until a finished AI reading existed — so a user with no API key
  could never export a document that is complete without any AI at all — and it
  did not export: it navigated to `/report`, where a second button had to be
  found. It is now one click, gated only on a stored chart. `canExportPdf` is
  deleted; its test suite asserted that gate as the requirement and has been
  inverted rather than removed.
- **The Interpretation section is no longer silently omitted.** With no reading,
  section VII simply vanished and the numbering jumped VI → VIII with no
  explanation. The section now always prints, carrying an honest note that a
  written interpretation appears once a reading is generated (optional,
  bring-your-own-key) and that the rest of the report is complete and unaffected.
- `isPlaceholderContent` now treats whitespace-only text as a placeholder; a
  summary of `"   "` previously rendered as an empty prose block.

### Added
- **A completeness guard so the export cannot silently fall behind the app
  again.** `lib/reportSections.ts` declares every report section once;
  `lib/__tests__/reportSectionParity.test.tsx` holds both renderers to it in
  both directions — a section on screen that is not declared fails by name, and
  a section declared exported that the PDF does not carry fails by name. Opting
  a section out requires writing the reason in the registry. Both directions were
  proven to fail before being trusted. Stated limit: this proves a section is
  *present*, not that it carries the same depth as the screen.
- `hooks/useReportPdfExport` — the single export assembly the dashboard and
  `/report` both call, reading persisted values only. It recomputes nothing, so
  the two entry points cannot drift into two different documents.
- **The Ed25519 signature check on strength receipts is now actually tested, and
  its failure modes are coded apart.** The suite had two "tamper" tests and
  neither one ever reached the signature: the mutated-`strength_pct` case leaves
  a stale `payload_hash` and dies at the content-hash compare, and the wrong-key
  case dies at the signer compare. Measured, not assumed — forcing avow's Ed25519
  verdict to always-succeed left all 12 tests green. A new test builds a genuinely
  valid receipt and flips **one hex nibble of the `signature` only**, leaving
  `payload_hash` and `public_key` correct, so both earlier gates pass and control
  reaches the Ed25519 check; under that mutation this test — and only this test —
  turns red. `@edgeproc/avow` moves `0.1.0` → `0.1.1`, which splits the single
  `SignatureInvalid` into `SignerMismatch` (wrong signer — a provenance failure)
  and `SignatureBytesInvalid` (right signer, bad bytes — a tamper failure), both
  still extending `SignatureInvalid`. The two existing tests are tightened to pin
  the specific subclass, so neither can silently stand in as signature coverage
  again. **No verification behavior changed** — the same receipts are rejected in
  the same order; only the typed error naming *which* gate rejected them is new.
- **Complete deterministic report artifacts (PR #62).** Exported daśā tables now
  cover **maha, antar, and pratyantar**; generation is keyed to the current
  **predictive cache identity**; AI-written sections require matching
  **interpretation provenance**; free-text event input uses
  **conservative life-event structuring**; and **semantic, geometric, and browser PDF gates**
  verify that the downloaded artifact is complete and readable.
- **Frontend dead-code gate (PR #65).** `knip` is wired into the single frontend
  gate, so the unused-export / dead-code axis auto-verifies on every `bun run
  gate` run — locally and in CI.

### Changed
- **Re-vendored the three vendored packages to their latest upstream releases**
  (provenance + recorded adaptations in each `VENDORED.md`; no storage-format,
  signing, or trust-root changes):
  - `backend/vendor/edge-proc`: v0.1.0 (`e3f1faa`) → **v0.1.2** (`3dabffa`).
    Docs/CI/release-plumbing delta only — zero changes to `edgeproc/` or its
    151-test suite. The snapshot keeps `[tool.uv.sources]` pointed at the
    sibling `../shared-libs-python` via upstream's own documented path-source
    toggle (now recorded as a local adaptation, since upstream ships a git-tag
    pin active).
  - `backend/vendor/shared-libs-python`: `0533ea0` → **v0.1.3** (`0ba9ba8`).
    Gate/CI/docs delta only — zero runtime code beyond the version string; the
    documented LICENSE-holder normalization is preserved.
  - `frontend/packages/edgeproc-browser`: edge-reco `999d987` → **`2471b0b`**
    (current main). Brings the embedder hardening + fail-closed bundle
    validation (`0da71f5`), signed ranking-config/co-occurrence support, and
    their parity suites. Local adaptations re-applied and now both recorded in
    `VENDORED.md`: the biome lint script/devDep drop, and the root-absolute
    `/public.key` resolution (+ `runtimeConfig.test.ts` regression test) that
    keeps deep-link loads verifying against the app origin's pinned key.
- **SEO, crawler delivery, and browser hardening (PR #61).** Split `/` into a
  brand-first shell (the full explainer stays at `/welcome`); stop assigning root
  content/canonicals to unknown routes and ship a branded static `404.html` with
  client-side `noindex`; replace blanket Pages/Workbox SPA fallbacks with explicit
  app-route allowlists; publish a factual `llms.txt`; and enforce HSTS,
  Permissions-Policy, and a CSP compatible with Pyodide/WASM, module/blob workers,
  Turnstile, embedded fonts, and user-configured AI endpoints.
- **AI error classification now routes through the vendored `@edgeproc/errors`
  registry (PR #68).** AlmaMesh becomes the reference consumer of the portfolio's
  canonical-errors standard — the hand-written `classifyConnectionError` chain is
  replaced by the shared coded-error registry. Behaviour-identical: the same HTTP
  status still yields the same coded error and the same existing `chat:errors.*`
  copy, with no i18n key changed.

### Fixed
- **Storage capability detection under SSR and Node 25.** Partial native
  `localStorage` shells are treated as unavailable by LLM settings and reset
  paths; browser tests install a deterministic in-memory Web Storage substitute,
  while real browser storage remains unchanged.
- **Compound life-event fallback extraction.** When AI is unavailable, dated
  milestones in one sentence are split into independent typed rows instead of
  collapsing onto the first detected category; the PDF can therefore render a
  clean event table from ordinary prose.
- **Deterministic report-PDF pagination (PR #63).** Report PDFs paginate the same
  way every time.
- **Rectification gated on current previews (PR #64).** Save and programmatic
  submit now fail closed until both candidate-time lagna previews are current and
  ready, so a slow-worker race can never skip the mandatory rising-sign-flip
  acknowledgement; preview failure surfaces a localized Retry action.
- **Specific AI-error messages in chat and reading (PR #67).** A shared coded
  mapper turns each HTTP status into precise copy (billing · bad key · dead
  model · rate limited · provider outage · endpoint unreachable), and the
  structured reading path now preserves the typed HTTP status instead of
  flattening it. New `chat:errors` keys (`auth_failed` / `rate_limited` /
  `server_error`) added in en/es/pt with a parity test.

### Security
- **Bumped `click` 8.3.1 → 8.3.3 to clear PYSEC-2026-2132.** `click` is a
  CLI-only transitive dependency (via `typer`, for the `almamesh-bundle` CLI) and
  is absent from the shipped PWA runtime, so this is pure supply-chain hygiene
  with no runtime-behavior change. Added a `click>=8.3.3,<8.4` floor to
  `[tool.uv] constraint-dependencies` and re-locked; the weekly Security-Audit
  now passes.
- **Re-locked vendored EdgeProc dependencies** to match its declared floors
  (`faiss-cpu` 1.14.3, `rank-bm25` 0.2.2, and the sibling `pgvector` floor),
  keeping the exact AlmaMesh gate reproducible.

## [0.4.0] - 2026-07-11

> Release-discipline note: tags v0.1.0–v0.3.0 were never cut (the public repo
> history begins at the 2026-06-25 "Initial public release" commit). Annotated
> tagging starts at **v0.4.0**; earlier versions are never backfilled.

Release notes: [docs/releases/v0.4.0.md](docs/releases/v0.4.0.md)

### Added
- **Backup & Restore (Spec 061).** Export all your data — profiles, charts,
  members, readings, settings — to a single file and import it in another
  browser. Everything stays client-side; the file is yours. Hardened with a
  follow-up integrity pass.
- **Robust birth-time rectification + comprehensive report (Spec 062).** The
  rectifier gains D9-lagna signals, deeper dasha keys, and a labeled score
  anatomy with honest qualitative bands (never a headline %); the wizard tells
  the per-event evidence story; the exported report grows to a comprehensive
  document including Section XII "Birth Time Authority"; chat + interpretation
  are grounded in the rectification record and live predictive contexts.
- **Opt-in cloud AI (Spec 063, then OpenRouter-first).** No AI by default —
  the chart is pure calculation. Opting in gets an OpenRouter-first setup with
  test-on-save connectivity checks, a model picker, an AI security gate, and
  live credits surfacing. (Spec 063's experimental on-device WebLLM tier
  shipped mid-cycle and was removed before this release — see Removed.)
- **SEO prerender (Spec 064).** Public routes (landing, welcome, legal) ship
  real HTML for crawlers — no JavaScript required — plus sitemap, robots, and
  IndexNow.
- **Regenerate reading + provenance.** Re-generate the AI reading on demand;
  every stored reading is stamped with the engine/model that produced it
  ("Generated by …").
- **Add people in place.** A ghost "+" star in the mesh constellation and a
  shared Add Person dialog — add a member without leaving the mesh view.
- **The full reading on the dashboard.** The complete AI interpretation —
  strengths, challenges, yoga narrative, guidance, remedies, upcoming
  periods — now renders on the dashboard with progressive disclosure, not
  only in the exported report.
- **Per-route social share cards.** Each public page (landing, welcome,
  legal) carries its own Open Graph image, generated at build time from the
  brand design tokens and self-hosted fonts — link previews are
  route-specific.
- **Online-primary birthplace search.** Birthplace lookup now queries
  Open-Meteo's geocoder first (with the offline city list as fallback), plus a
  coordinate-entry fallback for places missing from both.
- **"How this reading is made."** An honest grounding explainer on the
  dashboard names exactly what the deterministic engine computed and what the
  optional AI narrated.
- **Anonymous product feedback.** An optional, anonymous feedback signal
  (Cloudflare Pages Function + D1 + Turnstile), stamped with the app version.
- **Live e2e gates in CI.** A real first-run onboarding journey against the
  live in-browser engine, plus an unhappy-boot recovery drill (blocked bundle
  → recover).

### Changed
- **The Living Astrolabe.** The dashboard's 3D force-field hero is
  de-cluttered into one radiant core, a quiet zodiac wheel, and at most three
  dasha threads.
- **Landing page.** Readable hero, prominent open-source signal, the Generate
  CTA routes to your existing chart — and the data-privacy story is fully
  honest: the optional AI egress is named, with a data-portability blurb.
- **Rectification tone.** The life-events ask is reframed as an optional,
  warm invitation; the interview chat matches the chart chat (roomier
  textarea, shared bubbles, processing indicators).

### Fixed
- **Bundle signature verification on nested routes.** The verify key
  (`/public.key`) now resolves absolutely, so opening the app on a deep link
  no longer fails signature verification.
- **Onboarding birth-time entry.** The time field is draft-buffered — the
  first "Continue" click is no longer swallowed.
- **On-device chat defects**, fixed alongside the regenerate-reading control.
- **Public pages are indexable again.** The prerendered routes emitted
  directory indexes, so `/welcome` redirected to `/welcome/` while every
  canonical signal said `/welcome` — search engines saw a redirect loop and
  refused to index. The routes now emit flat files; the no-slash canonical
  serves directly.
- **Clearer AI failure surfaces.** A mistyped or retired cloud model id is
  detected (including OpenRouter's newer 400 response) and answered with a
  "switch model / check AI settings" prompt instead of a raw error.
- **Out-of-credits AI errors are honest now.** When a cloud AI account has run
  out of credits (e.g. an OpenRouter `402`), the reading says exactly that and
  points to billing — instead of the generic "check your model / try again"
  advice, which can never fix a billing problem.
- **Service worker self-heals.** A wedged service-worker session (the "site
  is down" symptom) now auto-recovers; `/public.key` is served NetworkFirst so
  a stale verify key can never be pinned by the cache.
- **Connectivity probe accepts reasoning models.** The test-on-save probe no
  longer rejects valid reasoning models (`max_tokens: 1` → 400).
- **Combustion carries into divisional charts** (D9 and the full D1–D60
  vargas).
- **Predictive layer persists.** Life Atlas no longer recomputes the full
  predictive superset on every reload.
- **Mobile.** Responsive layout pass kills horizontal overflow; the Regenerate
  button is reachable on mobile and the active-AI badge reads green.
- **Birthplace queries match natural input** — diacritics and state/country
  qualifiers no longer break matching.
- **Report PDF.** The life-events blob is cleaned up, with real
  render-to-bytes coverage.

### Removed
- **The on-device WebLLM AI tier.** Added mid-cycle (Spec 063), removed in
  favor of the cloud-only opt-in path — WebGPU model quality did not yet
  justify the weight. On-device AI may return when it does.

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
