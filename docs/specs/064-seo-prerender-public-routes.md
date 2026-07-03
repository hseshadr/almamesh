# Spec 064 — SEO: prerender the public routes at build time

**TL;DR:** Google indexes almamesh.com as an empty JS shell (`<div id="root">`),
and `/welcome` + the legal pages are unknown to it. Fix: prerender the five
PUBLIC routes into real per-route HTML files at `vite build` time with
`vite-prerender-plugin`, give each route unique head tags, list them in
`sitemap.xml`, keep the private app routes out via `robots.txt`, and ping
IndexNow after every deploy. The app itself stays a client-rendered local-first
PWA — nothing about the engine, the SW, or private routes changes.

## Public vs private surface

| Route | Status | Prerendered file |
|---|---|---|
| `/` | public (landing when no chart; client redirects to `/dashboard` when one exists) | `dist/index.html` |
| `/welcome` | public (stable shareable splash) | `dist/welcome/index.html` |
| `/privacy` | public | `dist/privacy/index.html` |
| `/terms` | public | `dist/terms/index.html` |
| `/data-deletion` | public | `dist/data-deletion/index.html` |
| `/dashboard /onboarding /predictive /report /mesh* /rectify/* /settings/* /life/*` | private — client-rendered only, `robots.txt` Disallow, NOT in sitemap | — (served via the SPA fallback) |

## Shipped path: `vite-prerender-plugin` (Node renderToString) — not the snapshot fallback

The plugin executes `src/prerender-entry.tsx` in Node during `vite build` and
writes the rendered HTML into `renderTarget: '#root'` per route. This worked
because the public-route graph is already SSR-clean by construction:

- The landing is **engine-free by contract** (`engineFree.test.ts`); the WebGL
  hero is `React.lazy` behind `Suspense fallback={null}`, so `renderToString`
  emits the full hero *text* and skips the three.js scene.
- `@almamesh/store` already guards `localStorage`/`indexedDB`/`navigator`.
- The one unguarded browser API on the path (`hasLocalChart()`'s raw
  `localStorage.getItem`) was fixed with a try/catch guard — which also fixes a
  real crash for browsers with storage disabled (e.g. Chrome "block all
  cookies").
- `usePrewarmEngineOnIntent` needs `ChartEngineContext`; the prerender entry
  provides a **no-op stub provider** (type-only import, no `@almamesh/browser`
  runtime code in the prerender graph).

Two build-exit scars found and fixed while landing this (both of the shape
"a module-scope handle keeps Node alive, so `vite build` finishes all work and
then hangs forever"):

1. **`react-dom/server` → `react-dom/server.edge`.** Under the client build's
   resolve conditions Vite bundles `react-dom-server.browser.production.js`,
   whose module scope creates a `new MessageChannel()` — a referenced libuv
   handle in Node. The edge build schedules with setTimeout/queueMicrotask
   only and is equivalent for synchronous `renderToString`.
2. **`HeroForceField` SSR gate.** `React.lazy` *initiates* the three.js/R3F
   chunk import during `renderToString`; with no `window` the hero now renders
   its static-gradient branch so the WebGL graph never loads in Node (pinned
   by the prerender canary test).

The emitted `assets/prerender-entry-*.js` chunk is build-time-only and is
excluded from the SW precache (`globIgnores`) — nothing in the browser
references it.

A third scar, caught only by driving the REAL onboarding on the built preview:
the plugin ships a second plugin, a `serve-prerendered-html` **preview
middleware** that rewrites every extensionless path without a matching
`<path>/index.html` to the prerendered `/index.html`. That includes the
engine's extensionless `/bundle/latest` pointer — a JSON fetch got HTML back
and the engine bootstrap died with CHART_GEN_001 under `vite preview` /
`poe demo` / the CI exit gate (production CF Pages was never affected —
`_redirects` lets real assets win). The middleware is filtered out and
replaced by `previewPublicRoutesMiddleware` in vite.config.ts: a CLOSED
allowlist that rewrites only the five public routes, mirroring Cloudflare
Pages' asset resolution.

The prerender entry renders ONLY the public shells (Landing / legal pages)
under `MemoryRouter` + `I18nextProvider` (English — the authoritative catalog).
It does **not** render `App.tsx`, `AppLayout`, or any provider that boots the
engine. Legal pages are prerendered without the app-shell header chrome; the
client render restores it. `prerender-entry.test.tsx` runs the same function
under Vitest's **node** environment, so any future browser-global leak into the
landing graph fails unit tests before it fails the build.

## Hydration: honest `createRoot` replacement, NOT `hydrateRoot`

`main.tsx` keeps `createRoot(...).render(...)`: the prerendered HTML is shown
until React mounts, then replaced. True `hydrateRoot` adoption is impossible
without restructuring the app: every page (including the landing) is
`React.lazy` behind a root `Suspense`, so first client render is the spinner
fallback — a guaranteed hydration mismatch. These are marketing/legal pages;
paint-then-replace is the pragmatic, honest choice. Crawlers and no-JS fetches
get the full content either way (that is the point of this spec).

**SPA-fallback guard:** `dist/index.html` (now carrying the prerendered landing
markup) is still the SPA fallback for every private deep link
(`_redirects: /* /index.html 200`, SW `navigateFallback`). A tiny inline script
right after `#root` empties it when `location.pathname` is not one of the five
public routes, so a user opening `/dashboard` sees today's spinner, not a flash
of the landing page.

## Per-route head tags

`src/seo/routeHead.ts` is the single typed source for per-route
title / meta description / canonical / og:* / twitter:* — injected by the
prerender entry via the plugin's `head.elements`. The static tags were removed
from `index.html` so no route carries duplicates. The SoftwareApplication
JSON-LD stays **static in `index.html`** (it predates this spec, carries the
existing public author attribution, and is valid site-level entity data on
every page). The route the SPA fallback serves for private paths carries the
`/` head tags — irrelevant to SEO since those routes are Disallowed.

OG image: reuses the existing `public/og-card.png` (1200×630) for every route.
A per-route OG image set is a possible follow-up, not part of this spec.

## sitemap.xml + robots.txt

- `public/sitemap.xml`: exactly the five public URLs (absolute
  `https://almamesh.com` locs).
- `public/robots.txt`: `User-agent: *` gets `Allow: /` plus `Disallow` for
  `/dashboard`, `/onboarding`, `/predictive`, `/report`, `/mesh`, `/rectify`,
  `/settings`, `/life`; `Sitemap:` pointer kept. The pre-existing AI-crawler
  groups (GPTBot etc.) keep their deliberate blanket `Allow: /` — they are
  training-opt-in declarations, and the private routes are empty shells anyway.
- `src/seo/publicFiles.test.ts` locks sitemap ⇄ `routeHead.ts` parity, the
  robots Disallow list, and the IndexNow key file.

## IndexNow

A fixed key (generated once, committed) lives at
`public/<key>.txt`; `.github/workflows/deploy.yml` gains a post-deploy step
that POSTs the five public URLs to `api.indexnow.org` — `|| true`, never able
to fail a deploy (Bing/Yandex/etc. consume IndexNow; Google does not, hence the
one-time GSC actions below).

## Service worker coexistence (Spec 063 config preserved)

- The four new per-route HTML files match the existing `**/*.html` precache
  glob — a few KB each, fine.
- `navigateFallback: '/index.html'` is untouched: offline/SW navigations to any
  route still serve the app shell (which for public paths now contains the
  landing markup — same content the route renders anyway; for private paths the
  inline guard empties it, exactly like the network path).
- Crawlers never run the SW: a no-JS fetch of `/welcome` is Cloudflare Pages
  serving `welcome/index.html` directly.

## Validation performed (see PR/report for evidence)

1. `bun run build` → the five HTML files exist in `dist/` and contain the real
   copy (hero headline, legal headings) + per-route meta, greppable with no JS.
2. `vite preview` + `curl` each route → content pre-JS; Playwright drive of the
   same routes → interactive render, zero console errors, SW registered.
3. Real onboarding pass on the built app → chart renders on `/dashboard`.
4. Gates: workspace typecheck, Vitest, ESLint on touched files, PII grep.

## One-time owner actions after deploy (not automatable from here)

1. Google Search Console → Sitemaps → submit `https://almamesh.com/sitemap.xml`.
2. GSC → URL Inspection → Request indexing for `/` and `/welcome`.
3. Cloudflare dashboard → almamesh.com zone → enable **Crawler Hints**.
