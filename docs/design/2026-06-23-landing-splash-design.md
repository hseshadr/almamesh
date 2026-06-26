# AlmaMesh landing / splash page — design spec

**Date:** 2026-06-23
**Status:** Approved (conversational), ready for implementation plan
**Branch:** `feat/landing-splash`

## TL;DR

AlmaMesh has no front door. Today `/` immediately redirects a first-time visitor
to `/onboarding`. This spec adds a **marketing splash page at `/`** that explains
what AlmaMesh is and why it's different — **free, computed on your own device, no
account, an honest experiment rather than a fortune-telling money machine** — and
sends visitors into onboarding with a single clear CTA.

The page must:
- **Render instantly** and cost a bouncing visitor **nothing** — the ~38 MB engine
  must **not** download just because someone read the pitch.
- Reuse the **Observatory** design system and ship **i18n en/es/pt**.
- Lead with the product's signature **3D force-field**, driven by a **static demo
  chart** (no Pyodide boot).
- Carry the founder's voice and the **anti-scam / "a gift, not a scheme"** thesis.

## Goals & non-goals

**Goals**
- A single, scrollable, high-craft landing page that converts curiosity → "Draw my chart".
- Honest positioning: an *experiment* done *rigorously*, free because these traditions
  were "handed down for the benefit of all".
- Zero engine cost for visitors who only read; instant first paint; offline-capable.
- Full en/es/pt parity.

**Non-goals (YAGNI)**
- No multi-page marketing site, blog, pricing page, or testimonials.
- No new backend, analytics, or tracking (the app is zero-egress; keep it that way).
- No naming/attacking specific competitor brands — contrast the *pattern*, not names.

## Placement & routing

- New component `LandingPage` rendered at `/` for **first-time** visitors
  (`hasLocalChart() === false`). Returning visitors (`hasChart === true`) keep
  redirecting to `/dashboard` — unchanged behavior.
- Update `RootRoute` (`apps/web/src/App.tsx:57-65`):
  `hasChart ? <Navigate to="/dashboard" replace /> : <LandingPage />`.
- The landing renders **outside `AppLayout`** (no profile switcher / AI-status chrome).
  It has its own minimal marketing nav and footer.
- It is a **lazy route chunk** (`const LandingPage = lazy(() => import('./pages/Landing'))`)
  whose imports are **engine-free**, so its chunk stays tiny and is precached by the
  existing Workbox config (app shell only; `pyodide/**`, `bundle/**`, `models/**`
  already excluded). It must **not** import anything that pulls in `@almamesh/browser`.
- The catch-all `*` route already points to `/`; `/` now renders the landing for
  fresh visitors, which is sensible.

## Engine-respect: defer the 38 MB download (decision: "wait until they commit")

**Current behavior:** `AlmaMeshRuntimeProvider` (mounted in `apps/web/src/main.tsx`
above the router) auto-boots the engine on mount via a once-only
`useEffect(() => { runBootstrap() }, [])`. So today *any* first paint — including a
visitor who only reads the splash — starts the 38 MB bundle sync.

**Required behavior:**
- A fresh visitor sitting on `/` (landing, no chart) → **no engine download**.
- The engine bootstrap **starts the moment the visitor shows intent** — hovering /
  focusing / clicking the "Draw my chart" CTA, or navigating to `/onboarding` — so
  it's a warm head start, not a cold wait, by the time they reach "Generate".
- Every engine-dependent route (onboarding, dashboard, predictive, mesh, report) and
  every returning visitor redirected to `/dashboard` must still boot the engine as
  before.
- The existing **retry/recovery contract is preserved** (`reboot()`, `whenReady()`,
  the warming/recovery card) — no returning visitor gets stuck.

**Implementation approach (implementer chooses cleanest wiring consistent with the
codebase):**
- Make the provider's bootstrap **idempotent and explicitly triggerable** — expose
  `startBootstrap()` via context (the existing `runBootstrap`, guarded to run at most
  once).
- **Gate the auto-boot off the landing route:** do not auto-boot when the initial
  location is `/` and `hasLocalChart() === false`. Boot on mount for every other case
  (so direct hits to `/onboarding`, `/dashboard`, returning visitors, etc. behave as
  today).
- Add a **prewarm-on-intent** hook `usePrewarmEngineOnIntent()` that the landing CTA
  binds to `pointerenter` / `focus` / `click`, calling `startBootstrap()`.
- Ensure engine-dependent routes call `startBootstrap()` on entry (e.g. a small
  `useEnsureEngineBooting()` used by onboarding, or a pathname-driven effect) so a
  user landing directly on `/onboarding` still warms immediately.

**Acceptance:** with a fresh profile, loading `/` fires **no** request to
`/pyodide/**`, `/bundle/**`, or `/models/**`; triggering the CTA starts those
requests; the chart still generates correctly downstream.

## Hero (decision: "live demo chart force-field")

- Full-viewport hero on the deep-navy Observatory background (`#0B0E17`).
- Reuse the app's signature `ForceFieldExperience`
  (`apps/web/src/components/forcefield/`) — but feed it a **static, bundled demo
  `SiderealChart` fixture** so it renders **without booting Pyodide**. The energy
  frame comes from the pure store adapter `buildEnergyFrame(chart, 0)` on the fixture
  (no engine). Lazy-load the hero canvas so the headline/CTA paint first, then the
  Three.js scene hydrates.
- A new `demoChart.ts` provides the fixture (curated static chart; may derive from an
  existing `apps/web/src/test/*Fixtures.ts` chart, copied into `src/` so it ships in
  the build, not just tests).
- **Headline:** *"Your real sky. Computed on your device. Free, forever."*
- **Subhead:** *"A faithful Vedic (sidereal) chart — planets, nakshatras, dashas —
  calculated in your browser. An honest experiment, not a fortune-teller. No account.
  No email. Nothing leaves your tab."*
- **Primary CTA:** *"Draw my chart — free"* → `/onboarding` (binds the prewarm hook).
  Microcopy: *"Works offline · 3 languages · open engine."*

## Sections (single scrollable page)

1. **Hero** — WHAT in one line + CTA (above).
2. **WHAT it computes** — real outputs as chips/cards: planets, signs, houses,
   nakshatras (with padas), Vimshottari dasha (maha/antar/pratyantar), D1–D60
   divisional charts, transits/Gochara, Ashtakavarga + Shadbala — *on your device*.
3. **WHY we're different** — framed by one quiet anchor line:
   *"These traditions were handed down for the benefit of all — a gift, not a
   scheme."* Then the **bold side-by-side** comparison (pattern, not brands):

   | AlmaMesh | The typical paid astrology site |
   |---|---|
   | **Free, forever** — no paywall | Subscriptions & "unlock your full reading" |
   | Runs **on your device**, in your browser | Runs on their servers |
   | **No account, no email** | Sign-up + email required |
   | Your birth data **never leaves your tab** | Birth data stored, profiled, monetized |
   | **Open engine, byte-identical to CPython** — verifiable | Black-box "predictions" |
   | Honest markers (a band is a *convention*, never a verdict) | Vague certainty, fear-based upsells |

4. **HOW it works** — 3 steps: (1) enter birth date / time / place; (2) the engine
   computes your full chart locally in your browser; (3) explore chart, timing &
   relationships — with an *optional* AI that **only narrates, never invents**.
   Zero-egress note: the chart engine makes **no** network calls.
5. **WHO it's for** — the curious; the privacy-conscious; skeptics who want a
   *verifiable* engine; practitioners who want a professional-grade tool for free.
6. **WHERE / WHEN** — every OS, installable PWA, offline after first load; available
   now, free, no waitlist.
7. **Why I built this (founder's note)** — quieter, narrower column, signed. Exact
   approved copy:

   > I've been drawn to Vedic astrology for a long time. I don't think it's an exact
   > science — and I won't pretend it is. But I kept noticing correlations too
   > interesting to wave away.
   >
   > I also believe these traditions — astrology, yoga, the whole inheritance — were
   > **handed down for the benefit of all**. They were a gift, not a scheme. Locking
   > them behind subscriptions and upsells gets that exactly backwards.
   >
   > So AlmaMesh is, honestly, an **experiment**: if you compute the chart
   > *rigorously* — the real sky, the best-practice methods, no shortcuts, no
   > showmanship — can it do meaningfully better than a coin flip, *consistently*?
   >
   > I don't know yet. That's the point. It's also why this is free, runs on your own
   > device, and never asks for your data — **an honest experiment can't be a sales
   > funnel, and a gift shouldn't have a paywall.** The math has to be impeccable, and
   > you should be able to check it yourself.
   >
   > — Harish

8. **The engine you can trust** — Skyfield + DE421 ephemeris; externally validated
   sub-arcsecond against astropy + JPL Horizons; deterministic, byte-identical on
   CPython and in-browser; the math is the source of truth, the AI only explains it.
9. **Final CTA** — *"Draw your chart — free, private, yours."* → `/onboarding`;
   secondary actions: install as a PWA, view source on GitHub.
10. **Footer** — links to Privacy / Terms / Data deletion (existing routes), GitHub,
    language switcher; one honest line.

> Content integrity: the approved copy above (hero, founder's note, comparison) is
> authoritative — render it faithfully. Other section microcopy may be lightly
> wordsmithed but must not overclaim (no "predict your future", no certainty claims);
> the engine/AI honesty framing is load-bearing.

## Component structure

All under `apps/web/src`. Each component is small, focused, content-via-`t()`,
independently testable, engine-free.

- `pages/Landing.tsx` — composes sections; owns the `landing` i18n namespace and the
  prewarm-on-intent CTA wiring.
- `components/features/landing/`
  - `LandingNav.tsx` — logo, language switcher, CTA.
  - `Hero.tsx` — headline/subhead/CTA + lazy-loaded `HeroForceField`.
  - `HeroForceField.tsx` — wraps `ForceFieldExperience` with the static `demoChart`.
  - `WhatSection.tsx`, `ComparisonSection.tsx`, `HowItWorksSection.tsx`,
    `WhoSection.tsx`, `WhereWhenSection.tsx`, `FounderNote.tsx`, `TrustSection.tsx`,
    `FinalCta.tsx`, `LandingFooter.tsx`.
- `lib/demoChart.ts` — static `SiderealChart` fixture for the hero (ships in build).
- `hooks/usePrewarmEngineOnIntent.ts` — idempotent engine prewarm bound to CTA intent.
- Edits: `App.tsx` (`RootRoute`, lazy import), `providers/AlmaMeshRuntimeProvider.tsx`
  (gate auto-boot + expose `startBootstrap()`), `i18n/config.ts` (register `landing`).

Reuse existing primitives: `components/ui/{Button, Card, Logo}`; tokens from
`@almamesh/constants`; Fraunces (display) + Hanken Grotesk (body) self-hosted fonts.
Build with the **frontend-design** skill for a distinctive, non-generic look.

## i18n

- New `landing` namespace: `apps/web/src/locales/{en,es,pt}/landing.json`, mirroring
  the shape of an existing namespace (e.g. `common.json`). en authoritative; es/pt
  machine-translated carrying `_meta.review: "machine-translated"`.
- Register in `apps/web/src/i18n/config.ts` (add import, add to `I18N_NAMESPACES`, add
  to each language block in `resources`).
- **All** visible strings via `t()`. Three-way key parity enforced by tests + the
  existing `verify-i18n` gate.

## Testing (TDD — tests land with the code)

**Vitest (unit):**
- `RootRoute` renders `LandingPage` when no chart; redirects to `/dashboard` when a
  chart exists.
- `Landing` renders every section and the CTA links to `/onboarding`.
- `HeroForceField` renders from the static `demoChart` fixture **without** any engine
  call (no `@almamesh/browser` import at module load).
- `usePrewarmEngineOnIntent` calls `startBootstrap` exactly once on intent.
- i18n key parity: `landing.json` keys identical across en/es/pt.

**Playwright (live, against the production build):**
- A fresh visitor at `/` sees the splash; **no** `/pyodide`, `/bundle`, or `/models`
  request fires while on the landing.
- Triggering the CTA starts the engine bootstrap and lands on `/onboarding`.
- The full onboarding → chart still works end-to-end afterward (no regression).
- Console clean; renders correctly in en, es, pt.

## Live validation (CLAUDE.md non-negotiable)

Build + preview, drive `/` in the project's Playwright Chromium:
- Splash renders instantly and is reachable; the hero force-field animates from the
  demo fixture.
- Network panel confirms **zero** engine/bundle requests on the landing; they begin
  only on CTA intent.
- CTA → onboarding boots the engine and a chart renders on `/dashboard`.
- es/pt verified on screen; console clean.

## Risks / notes

- **Hero bundle weight:** the force-field pulls Three.js into the landing chunk. Keep
  the hero lazy so first paint isn't blocked; verify the landing chunk still loads
  fast. If it bloats first paint unacceptably, fall back to rendering the canvas after
  an idle callback. (The *engine* stays out regardless — the fixture is static.)
- **Provider restructure:** gating the auto-boot is the one cross-cutting change;
  guard it carefully to avoid breaking the recovery contract or the "warm during
  onboarding" head start. Covered by the no-regression e2e.
- **Signature** is a single string ("— Harish"), trivially changeable.
