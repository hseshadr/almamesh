# AlmaMesh

**A free, local-first Vedic astrology app that runs entirely in your browser.**
Give it a birth date, time, and place; it computes a full sidereal (star-based,
not the Western calendar zodiac) chart —
planets, signs, houses, nakshatras, and Vimshottari dasha periods — on your own
device, in a tab. You get **degree-accurate North- and South-Indian kundli
charts** and a **live 3D planetary force-field** of the sky at your birth
moment. **Your chart is pure calculation — no AI touches it by default.** AI
interpretation and chat are strictly opt-in and **bring-your-own**: a one-click
**OpenRouter** preset, or any **OpenAI-compatible endpoint** (including a local
**Ollama**). Your key lives only in this browser, and chart-derived AI prompts
are PII-redacted. No account, no data harvesting. Install it as a
PWA and it works offline after the first load.

**▶ Try it live: [almamesh.com](https://almamesh.com)** — no install, no sign-up.

![AlmaMesh landing — the Observatory PWA](docs/assets/landing.png)

## Why it is different

Most astrology apps ask you to trust a server with personal birth data. AlmaMesh
does not have a chart-data server. The browser downloads a signed engine once,
verifies it, and computes charts locally in a Web Worker.

**The engine reads no clock.** A chart is a pure function of four recorded
inputs — birth instant, latitude, longitude, and the *reference instant* that
selects the current Vimshottari period. The app stores that fourth input with the
chart, so the same inputs produce the same bytes on CPython and in the browser.

## What ships

- Degree-accurate North- and South-Indian charts, D1–D60 divisional charts,
  Vimshottari periods, transits, Shadbala, Ashtakavarga, and life-domain timing.
- Multiple local profiles plus relationship readings between two finished charts.
- Birth-time rectification from dated life events. The accepted time becomes the
  chart authority; rejected candidates never feed transit houses or the report.
- The report is available without AI: export the same chart twice and the two files are
  byte-for-byte identical. Long life histories become dated,
  categorized table rows with bounded text and controlled page breaks.
- English, Spanish, and Portuguese, bundled for offline use.
- Optional AI interpretation and chat. AI is off by default. If you enable it,
  requests go directly from your browser to the endpoint you configure. Asking
  AI to organize free-form life events sends that narrative as written only
  after the in-product disclosure.

For the complete capability matrix, see [Status](#status). For implementation
details, see [Architecture](#architecture).

## Runtime network and data flow

The chart engine is zero-egress: chart computation stays on your device, and it
is deterministic in the sense above — same four recorded inputs, same bytes. The
complete browser network inventory is:

| Trigger | Destination | Data sent | Explicitly not sent |
|---|---|---|---|
| First load, signed engine sync, PWA update | `almamesh.com` | Asset URLs, normal HTTP request metadata | Names, birth data, charts, life events |
| Birthplace search while online | Open-Meteo geocoding | City text you type plus ordinary HTTPS/request metadata visible to the provider | Name, birth date/time, chart; an offline city-list fallback is bundled |
| Optional interpretation or chat | Your configured OpenAI-compatible endpoint | PII-redacted chart facts and, for chat, the question you type | Profile name and birth date |
| Optional life-event organization | Your configured OpenAI-compatible endpoint | The narrative you submit, as written, after the disclosure | Birth details and chart data |
| OpenRouter model list or credit check in Settings | OpenRouter | API request plus the configured key; the credit response concerns that provider account | Chart, birth data, chat, life events |
| Opening feedback when Turnstile is configured | Cloudflare Turnstile | Normal anti-bot request metadata and a challenge token | Chart and birth data |
| Sending feedback | Same-origin `/api/feedback` | Page identifier, thumbs sentiment, optional message as written, Turnstile token | Chart and birth data unless the user puts them in the optional message |

`local_only` fail-closes if a configured AI endpoint is not local. Production
diagnostics emit allowlisted codes only—never raw prompts, narratives, provider
errors, city text, chart data, or profile names.

**The browser enforces that table.** This inventory is not a promise you have to
take on trust: the deployed `Content-Security-Policy` (see
`frontend/apps/web/public/_headers`) restricts `connect-src` to a closed
allowlist—this origin, `openrouter.ai`, `geocoding-api.open-meteo.com`, and
loopback (`localhost` / `127.0.0.1`, any port, for a local model). Any other
destination is refused by the browser itself, so code that tried to send your
data somewhere else could not, even if it wanted to. A consequence worth knowing:
a custom AI endpoint on a **non-loopback** address—a LAN machine like
`http://192.168.1.10:11434`, or a third-party proxy—is blocked by that policy;
use a loopback endpoint or OpenRouter.

## Building from source — prerequisites

**TL;DR: this repo is self-contained — a single `git clone` builds everything.**
The Python side resolves every dependency from PyPI, including
[`edge-proc`](https://pypi.org/project/edge-proc/) — the signed local-data engine.
One dependency is still vendored in-repo, with provenance, license, and re-vendor
policy documented in a `VENDORED.md` next to the code:

- `frontend/packages/edgeproc-browser` — `@edgeproc/browser`, the in-browser
  bundle-sync tier (a regular Bun workspace package)

No sibling checkouts, no private access, no tokens: `git clone`, then
`uv sync` + `bun install`, then run. CI builds from this same single checkout.

## Quickstart — generate a chart in your browser, offline

Requires [Bun](https://bun.sh/), [`uv`](https://docs.astral.sh/uv/), and
Python 3.13. Nothing else — every dependency ships in this repo.

```bash
git clone https://github.com/hseshadr/almamesh.git && cd almamesh

# One command, from the repo root. Installs deps, builds the dev assets, then
# builds and opens the app at http://localhost:4173.
uv run poe demo
```

> The first run fetches the Pyodide dist and the DE421 ephemeris once (network
> required); after that the app is fully offline. Use `uv run poe demo-fresh` to
> force-rebuild the signed dev bundle.

<details>
<summary>What <code>poe demo</code> runs under the hood (the manual steps)</summary>

```bash
# 1. Install workspace deps
cd frontend
bun install

# 2. One-time: build the dev assets the in-browser engine needs.
#    This fetches a self-hosted Pyodide dist and signs a dev edge-proc bundle
#    (DE421 + wheels + meta) into apps/web/public/ — all gitignored.
#    The script lives at frontend/apps/web/scripts/setup-dev-assets.sh.
cd apps/web
./scripts/setup-dev-assets.sh

# 3. Build and preview. IMPORTANT: the engine's module Workers only resolve in a
#    production build, NOT `vite dev` — so build first, then preview.
bun run build
bun run preview            # prints a local URL, e.g. http://localhost:4173
```

</details>

Open the previewed URL, enter a birth date/time/place (birthplace search tries
Open-Meteo first and falls back to the bundled city list), and generate a chart.
After the location is resolved, chart calculation and rendering stay on-device;
the app keeps working with the network disabled.

> **Dev-server caveat:** `bun run dev` (`vite dev`) is fine for editing UI, but
> the dev server's ESM module Workers fail to resolve the `pyodide` import in
> worker scope, so the *engine* only runs in a real build (`vite build` +
> `vite preview`). The live exit-gate test below drives exactly that build.

### No-frontend path: a real chart in one command

Prefer the terminal? The same engine has an offline CLI — no browser, no server.

```bash
cd backend
uv sync --extra dev
uv run almamesh-chart "1990-01-15T12:00:00+00:00" 40.7128 -74.0060
```

It prints the full sidereal chart as JSON — ascendant, the nine grahas with
sign/nakshatra/pada, whole-sign houses, and the active dasha hierarchy — with no
network and no account. (`examples/run_chart.sh` wraps the same call.)

## Publish a signed bundle (build-time)

The engine's data and wheels are delivered to browsers as a **signed,
content-addressed bundle**. A device verifies an ed25519 signature against a
pinned key and **fails closed** on any tampering. Compute always stays local; the
network is delivery-only.

```bash
cd backend
uv run almamesh-bundle keygen ./keys                              # raw ed25519 keypair (0o600 private key)
uv run almamesh-bundle bundle ./origin ./keys/private.key --version v1
```

`./origin` is a static directory any web server or CDN can serve; `public.key` is
pinned into the client as the trust root. (`setup-dev-assets.sh` runs this for you
to produce the local dev bundle.)

One identity note for cold readers: the pinned key is per-environment and never
committed. A local build uses a throwaway **dev** key that `setup-dev-assets.sh`
generates into `frontend/apps/web/public/public.key` (git-ignored), while the
production deploy injects the separate **prod** key from CI secrets — so the live
`https://almamesh.com/public.key` will not match your local copy, by design.
Verify live bundles against the live `/public.key`.

## Architecture

Deeper dives: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (the signed-bundle →
OPFS → Pyodide flow, with the d2 diagram) and
[docs/QUICKSTART.md](docs/QUICKSTART.md) (`make demo` to a rendered chart).

```
Browser (the product) ─ installable PWA, offline after first load
│
├─ frontend/apps/web             React + Vite + Tailwind UI
│    └─ birthplace search        Open-Meteo first, bundled city fallback
│
├─ frontend/packages/browser     the in-browser engine
│    ├─ edge-proc bundle sync ──▶ verifies ed25519 + sha256, materializes into OPFS
│    └─ Pyodide Web Worker  ────▶ boots the UNCHANGED almamesh wheel, computes the chart
│         │  emits SiderealChart (TS mirror of the Python SiderealContext)
│         ▼
├─ frontend/packages/store       pure adapters (reshape only, no astrology):
│    ├─ SiderealChart -> ChartData          (the UI contract)
│    ├─ buildChartGeometry(SiderealChart)   (N/S kundli geometry)
│    ├─ buildEnergyFrame(SiderealChart, t)  (3D force-field frame)
│    ├─ profiles + members                  (named, password-less people; typed relationships)
│    └─ mesh                                (MeshEdgeContext per pair → the /mesh edge view)
├─ frontend/packages/llm         optional interpretation + chat, NO AI by default;
│                                opt-in, BYO OpenAI-compatible endpoint (one-click
│                                OpenRouter preset or a local Ollama); save runs a
│                                connectivity test; chart prompts PII-redacted, fail-closed
│                                local_only; mesh narration is role-anonymized
│                                (no names leave the device)
├─ frontend/packages/shared-types      UI-facing TypeScript contracts
├─ frontend/packages/constants         single design-token source
├─ frontend/packages/memory            local semantic chat memory
└─ frontend/packages/edgeproc-browser  signed-bundle sync and verification

Build-time (Python, no server)
│
└─ backend/src/almamesh
     ├─ calculations.py          sidereal astronomy (Skyfield + DE421; Lahiri default,
     │                           True-Chitra ayanamsa + True-node selectable)
     ├─ dasha/  yogas/           Vimshottari dasha + yoga detection
     ├─ transits/  strength/     predictive: Gochara/Sade Sati, Ashtakavarga + Shadbala, vargas
     ├─ mesh/                    relationship engine: Ashtakoota Guna Milan + Mangal (cited
     │                           classical tables), chart overlay, daśā synchrony, significators
     │                           → a frozen, read-only MeshEdgeContext per pair
     └─ edge/
          ├─ chart_runtime.py    deterministic on-device chart runtime (also runs under Pyodide)
          ├─ bundle.py           signed bundle publisher + consumer
          ├─ cli.py              almamesh-chart   (offline chart, no browser)
          └─ publish_cli.py      almamesh-bundle  (keygen + sign + publish the bundle)
```

The Python entrypoint the browser calls (`calculate_sidereal_context(...,
reference_date=...)`) is the *same* one the CLI calls. The fixed `reference_date`
pins the "current" dasha, which is what makes a chart reproducible byte-for-byte
across CPython and Pyodide.

You can check the sub-arcsecond accuracy claim yourself. It runs **fully
offline**: the engine uses the vendored `backend/de421.bsp`, and the independent
astropy + JPL Horizons oracle values are committed as fixtures (no live download
or API call at test time).

```bash
# Engine longitudes vs an independent astropy oracle (with a committed JPL
# Horizons cross-check), agreeing to sub-arcsecond — natal + transits:
cd backend && uv run pytest tests/validation/test_ground_truth.py tests/test_transit_reference.py -q
```

### Is the browser chart really byte-identical?

Yes, and you can watch it being checked. `verify-browser-parity.mjs` boots the
app in headless Chromium from a served origin, drives the **real** Pyodide Web
Worker, and asserts every fixture in the committed CPython golden comes back
byte-for-byte identical. It runs on every PR and every push to `main`.

```bash
cd frontend && bun install && bash apps/web/scripts/setup-dev-assets.sh && cd apps/web
bunx playwright install chromium                       # one time
VITE_API_URL= VITE_EXIT_GATE_HOOKS=1 ./node_modules/.bin/vite build --outDir dist-verify
VITE_API_URL= ./node_modules/.bin/vite preview --outDir dist-verify --port 4199 --strictPort &
node scripts/verify-browser-parity.mjs http://localhost:4199 \
  --reference-date=2025-01-01T00:00:00+00:00
```

The reference date is an **argument, not a constant baked into the gate**. That
matters: the date pins the "current" dasha, and a gate that hardcodes the one
value it is pinning cannot tell you whether the pin ever reached the engine. So
the gate also runs a *sensitivity control* — the same chart at a different
reference date must produce different bytes. If it doesn't, the gate fails,
because a parity result that ignores its own inputs proves nothing. Pass a
different `--reference-date` yourself and watch the comparison go red.

**What this gate does and does not cover.** It covers the **natal chart**: all
seven fixtures in `backend/tests/fixtures/chart_golden_de421.json`, and it fails
if the golden gains a fixture the gate does not compute. The transit,
predictive, and mesh goldens are enforced **CPython-side** by the backend test
suite; their Pyodide-in-a-browser parity is *not* browser-gated yet. Saying so
here rather than letting the badge imply more than it checks.

See [`frontend/README.md`](frontend/README.md) for the monorepo layout and the
full set of dev/build/test commands.

## Versioning

**v0.4.0 is the application release tag.** Backend and frontend workspace package
versions describe independently versioned implementation layers and need not equal
the app tag.

## Status

| Capability | What | State |
|------------|------|-------|
| Engine | Deterministic sidereal chart + dasha + yogas (Python); Lahiri default, True-Chitra + True-node selectable | ✅ shipped, tested |
| Engine validation | External golden-reference check: astropy (independent code path) + committed JPL Horizons cross-check, agreeing to sub-arcsecond; license-clean (no Swiss Ephemeris) | ✅ shipped, tested |
| Bundle publisher | Signed, content-addressed bundle publish/sync | ✅ shipped, tested |
| Offline CLI | `almamesh-chart`, `almamesh-bundle` | ✅ shipped, tested |
| In-browser engine | The Python wheel in Pyodide/WASM, off the UI thread | ✅ shipped (byte-parity gated in CI, [in a real browser](#is-the-browser-chart-really-byte-identical)) |
| N/S Indian charts | Degree-accurate SVG kundli off a pure geometry adapter | ✅ shipped |
| 3D force-field | three.js hero, planets at real ecliptic longitude | ✅ shipped |
| D9 Navamsa | Engine computes the Navamsa; renders in both kundli styles + the print report | ✅ shipped |
| Divisional charts (D1–D60) | Full Shodasavarga set; D9 also rendered as a kundli, the rest as tables | ✅ shipped |
| Predictive layer ("Sky & Timing") | Transits/Gochara + Sade Sati, dasha depth (antar/pratyantar), Ashtakavarga + Shadbala, per-life-domain forecasts; `/predictive` route (incl. a Periods explorer + Road Ahead) + report sections VIII–XI | ✅ shipped |
| The mesh (relational astrology) | Per-pair relationship read of two whole charts: Ashtakoota Guna Milan + Mangal screening (cited classical tables, partner edges only), chart overlay, daśā synchrony, significators; role-anonymized AI narration, read-only by construction; `/mesh` constellation + `/mesh/:memberId` edge view | ✅ shipped |
| Members | People you add to your mesh, with typed relationships (spouse/partner/family/friend/…), each owning a full chart; persisted with a versioned migration; managed in Settings → People | ✅ shipped |
| AI interpretation + chat | Off by default (pure calculation); opt-in BYO OpenAI-compatible endpoint (one-click OpenRouter preset or a local Ollama); saving runs a connectivity test so a bad key/model is reported immediately; chart prompts are PII-redacted and life-event prose is disclosed separately; fail-closed | ✅ shipped |
| PDF export | Report available after a chart exists (cover + D1/D9 + daśā + predictive sections VIII–XI + Birth Time Authority §XII); AI-written sections require current, provenance-matched interpretation. Byte-reproducible: two exports of one chart are the same file, asserted by SHA-256 in `e2e/report-pdf.e2e.spec.ts` | ✅ shipped |
| Birth-time rectification | Per-profile rectified time + confidence in Settings; recomputes the chart | ✅ shipped |
| Named profiles | Multiple password-less people per device, each owning its charts; rename + delete (chart cascade) | ✅ shipped |
| Birthplace search | Online-primary Open-Meteo lookup with a bundled offline fallback; the city query and ordinary network metadata leave the device, never chart/profile data | ✅ shipped |
| Internationalization | English / Spanish / Portuguese; react-i18next, offline bundled catalogs (zero-egress), persisted language + `<html lang>` sync, AI answers in-language; en authoritative, es/pt machine-translated | ✅ shipped |
| PWA delivery | Service worker + offline reboot + provenance footer | ✅ shipped |

The old SaaS backend (FastAPI, Postgres, Redis, Supabase auth) has been
**removed**. AlmaMesh has no account or chart-data API; only the optional
same-origin feedback function stores the disclosed anonymous feedback record.
See [`CHANGELOG.md`](CHANGELOG.md).

## Development

```bash
# From the repository root: Python quality + frontend quality + tests + builds.
make gate
```

The required CI exit gate then generates the signed browser assets and drives
the real onboarding, parity, offline, and report-PDF journeys in Chromium.

## License

MIT — see [`LICENSE`](LICENSE).
