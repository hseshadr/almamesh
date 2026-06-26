# Landing / Splash Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Each component task MUST also invoke the `frontend-design` skill for the visual implementation, and `superpowers:test-driven-development` for the test-first cycle. Spec: `docs/design/2026-06-23-landing-splash-design.md`.

**Goal:** Add an instant-loading, engine-free marketing splash page at `/` that explains AlmaMesh (free, on-device, honest experiment, "a gift not a scheme") and routes first-time visitors into onboarding — without downloading the 38 MB engine until they commit.

**Architecture:** New lazy `LandingPage` rendered by `RootRoute` for visitors with no saved chart, mounted *outside* `AppLayout`. The eager engine bootstrap in `AlmaMeshRuntimeProvider` is gated off the landing route and exposed as an idempotent `startBootstrap()`, prewarmed on CTA intent. The signature force-field hero is driven by a static demo `SiderealChart` fixture so it renders with no Pyodide boot. New `landing` i18n namespace (en/es/pt).

**Tech Stack:** React + Vite + TypeScript, Tailwind (Observatory preset from `@almamesh/constants`), react-router-dom, react-i18next, Zustand, Three.js (existing force-field), Vitest + Playwright.

## Global Constraints

- **No engine on the landing path:** rendering `/` for a fresh visitor must fire **zero** requests to `/pyodide/**`, `/bundle/**`, `/models/**`. (Spec: Engine-respect.)
- **Engine-free imports in the landing chunk:** never import `@almamesh/browser` (or anything that transitively boots it) at the top level of any landing module. The hero uses a **static** `SiderealChart` fixture + the pure `buildEnergyFrame` adapter only.
- **i18n parity mandatory:** every visible string via `t('landing:…')`; `landing.json` keys identical across en/es/pt; es/pt carry `_meta.review: "machine-translated"`; en authoritative. (Standing project rule.)
- **Design system only:** Observatory tokens from `@almamesh/constants` (`bg-background-primary`, `text-text-primary`, `text-accent-gold`, lapis), Fraunces (display) + Hanken Grotesk (body) self-hosted fonts; reuse `components/ui/{Button,Card,Logo}`. Build visuals with the `frontend-design` skill (distinctive, non-generic).
- **Content integrity:** the approved hero headline/subhead, the founder's note, and the comparison table copy in the spec are authoritative — render verbatim. No overclaiming anywhere (no "predict your future"/certainty). The AI "narrates, never invents" framing is load-bearing.
- **Preserve the engine recovery contract:** `reboot()` / `whenReady()` / warming-recovery card must still work; engine-dependent routes (onboarding, dashboard, predictive, mesh, report) and returning visitors → `/dashboard` must still boot the engine as before.
- **Tests land with code; frequent commits; TDD.** All gates green before done: `bun run --filter '*' typecheck`, `bun run --filter @almamesh/web lint`, `bun run --filter @almamesh/web test:unit`, build + preview, live Playwright.

---

## File Structure

**Create (all under `frontend/apps/web/src`):**
- `pages/Landing.tsx` — composes the page, owns the CTA wiring + `landing` namespace.
- `components/features/landing/LandingNav.tsx`
- `components/features/landing/Hero.tsx`
- `components/features/landing/HeroForceField.tsx`
- `components/features/landing/WhatSection.tsx`
- `components/features/landing/ComparisonSection.tsx`
- `components/features/landing/HowItWorksSection.tsx`
- `components/features/landing/WhoSection.tsx`
- `components/features/landing/WhereWhenSection.tsx`
- `components/features/landing/FounderNote.tsx`
- `components/features/landing/TrustSection.tsx`
- `components/features/landing/FinalCta.tsx`
- `components/features/landing/LandingFooter.tsx`
- `components/features/landing/index.ts` — barrel.
- `lib/demoChart.ts` — static `SiderealChart` fixture for the hero.
- `hooks/usePrewarmEngineOnIntent.ts` — idempotent engine prewarm bound to CTA intent.
- `locales/en/landing.json`, `locales/es/landing.json`, `locales/pt/landing.json`
- Tests: colocated `*.test.tsx`/`*.test.ts` next to each module per repo convention, plus `e2e/landing.spec.ts` (or a `verify-landing.mjs` mirroring existing `verify-*.mjs`).

**Modify:**
- `App.tsx` — `RootRoute` renders `LandingPage` for no-chart; add lazy import; ensure landing renders outside `AppLayout`.
- `providers/AlmaMeshRuntimeProvider.tsx` — gate auto-boot off the landing route; expose idempotent `startBootstrap()`.
- `i18n/config.ts` — register the `landing` namespace.

---

## Task 1: `landing` i18n namespace (en/es/pt) + registration

**Files:**
- Create: `frontend/apps/web/src/locales/{en,es,pt}/landing.json`
- Modify: `frontend/apps/web/src/i18n/config.ts`
- Test: `frontend/apps/web/src/locales/landing.parity.test.ts`

**Interfaces:**
- Produces: the `landing` namespace keys consumed by all UI tasks. Key tree (authoritative names):
  `nav.{cta,languageLabel}`, `hero.{headline,subhead,cta,microcopy}`,
  `what.{title,intro,items[]}`, `why.{anchor,title,colA,colB,rows[].{a,b}}`,
  `how.{title,steps[].{title,body},zeroEgress}`, `who.{title,items[]}`,
  `whereWhen.{title,where,when}`, `founder.{title,body (array of paragraphs),signature}`,
  `trust.{title,body,points[]}`, `finalCta.{title,cta,installPwa,viewSource}`,
  `footer.{tagline,privacy,terms,dataDeletion,github}`.

- [ ] **Step 1: Read an existing namespace to mirror shape and the `_meta.review` convention.**
  Read `frontend/apps/web/src/locales/en/common.json`, `…/es/common.json`, and `frontend/apps/web/src/i18n/config.ts`. Note how namespaces are imported, added to `I18N_NAMESPACES`, and placed in `resources` per language.

- [ ] **Step 2: Write the parity test (failing).**
```ts
// landing.parity.test.ts
import { describe, it, expect } from 'vitest'
import en from './en/landing.json'
import es from './es/landing.json'
import pt from './pt/landing.json'

const keys = (o: unknown, p = ''): string[] =>
  o && typeof o === 'object'
    ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        k === '_meta' ? [] : keys(v, p ? `${p}.${k}` : k))
    : [p]

describe('landing i18n parity', () => {
  it('es matches en keys', () => expect(keys(es).sort()).toEqual(keys(en).sort()))
  it('pt matches en keys', () => expect(keys(pt).sort()).toEqual(keys(en).sort()))
})
```

- [ ] **Step 3: Author `en/landing.json`** with the authoritative copy from the spec (hero headline/subhead, the `why.anchor` "These traditions were handed down for the benefit of all — a gift, not a scheme.", the full comparison rows, the founder's note paragraphs verbatim, signature "— Harish", trust/how/who/where-when copy). No overclaiming.

- [ ] **Step 4: Author `es/landing.json` and `pt/landing.json`** — machine-translate every value, keep keys identical, add `"_meta": { "review": "machine-translated" }` at the root.

- [ ] **Step 5: Register in `i18n/config.ts`** — add the three imports, add `'landing'` to `I18N_NAMESPACES`, add `landing: <lang>Landing` to each language block in `resources`.

- [ ] **Step 6: Run parity test → PASS.** `cd frontend/apps/web && bun run test:unit -- landing.parity`

- [ ] **Step 7: Commit.** `git commit -m "feat(landing): i18n landing namespace (en/es/pt)"`

---

## Task 2: Static demo chart fixture (engine-free)

**Files:**
- Create: `frontend/apps/web/src/lib/demoChart.ts`
- Test: `frontend/apps/web/src/lib/demoChart.test.ts`

**Interfaces:**
- Produces: `export const DEMO_CHART: SiderealChart` — a complete, static fixture valid as input to `buildEnergyFrame(chart, 0)` and `activeDashaFromChart(chart)`. Imports the `SiderealChart` type only (type-only import; no engine).

- [ ] **Step 1: Find a usable static chart.** Read `frontend/apps/web/src/test/*Fixtures.ts` and the `SiderealChart` type (`@almamesh/shared-types` or `@almamesh/browser` types — use a **type-only** import). Pick the smallest existing fixture that already satisfies `buildEnergyFrame`.

- [ ] **Step 2: Write the failing test.**
```ts
import { describe, it, expect } from 'vitest'
import { DEMO_CHART } from './demoChart'
import { buildEnergyFrame } from '@almamesh/store'

describe('DEMO_CHART', () => {
  it('drives the energy frame with no engine', () => {
    const frame = buildEnergyFrame(DEMO_CHART, 0)
    expect(frame).toBeTruthy()
  })
})
```

- [ ] **Step 3: Implement `demoChart.ts`** — copy a valid fixture into `src/lib/` (so it ships in the build, not just tests) and export it as `DEMO_CHART`. Type-only import of `SiderealChart`. Add a comment: "Static fixture for the marketing hero — NOT engine output; never used for a real reading."

- [ ] **Step 4: Run test → PASS.**

- [ ] **Step 5: Verify no engine import.** Confirm `demoChart.ts` imports nothing from `@almamesh/browser`. `grep -n "@almamesh/browser" src/lib/demoChart.ts` → no matches.

- [ ] **Step 6: Commit.** `git commit -m "feat(landing): static demo chart fixture for the hero"`

---

## Task 3: Defer engine boot + prewarm-on-intent

**Files:**
- Modify: `frontend/apps/web/src/providers/AlmaMeshRuntimeProvider.tsx`
- Create: `frontend/apps/web/src/hooks/usePrewarmEngineOnIntent.ts`
- Test: `frontend/apps/web/src/providers/runtimeAutoboot.test.tsx`, `frontend/apps/web/src/hooks/usePrewarmEngineOnIntent.test.tsx`

**Interfaces:**
- Produces:
  - Provider context gains `startBootstrap(): void` — idempotent; starts the bundle sync/boot at most once; safe to call repeatedly. (Reuses the existing `runBootstrap`.)
  - `usePrewarmEngineOnIntent(): { onPointerEnter, onFocus, onClick }` — handlers that call `startBootstrap()` once. Spread onto the CTA element/Link.
- Consumes: the existing runtime context shape (read the file first) and `hasLocalChart()` from `lib/localChart.ts`.

- [ ] **Step 1: Read the provider.** Read `providers/AlmaMeshRuntimeProvider.tsx` in full — note the context value shape, `runBootstrap`, the mount `useEffect` (≈ lines 158-164), and `whenReady`/`reboot` (≈ 146-156). Read `main.tsx` to see whether the provider sits inside or outside `<BrowserRouter>`.

- [ ] **Step 2: Write the failing autoboot test.** Behavior: when the initial path is `/` and `hasLocalChart()` is false, the provider does **not** call `runBootstrap` on mount; in all other cases it does. Mock `runBootstrap`/the bundle sync and `hasLocalChart`; render the provider at path `/` (no chart) and assert boot not called; render at `/onboarding` (or `/` with chart) and assert boot called.

- [ ] **Step 3: Implement the gate + `startBootstrap`.**
  - Add `startBootstrap()` to the context: an idempotent wrapper around `runBootstrap` (guard with a ref so it fires once).
  - Replace the unconditional mount auto-boot with: `if (shouldAutoBoot) startBootstrap()`, where `shouldAutoBoot = !(initialPath === '/' && !hasLocalChart())`. Compute `initialPath` from `window.location.pathname` (the provider may be above the router).
  - Ensure engine-dependent routes still boot: add a `startBootstrap()` call on entry to onboarding (a one-line `useEffect` calling the context `startBootstrap`, or a pathname effect). Keep `reboot()`/`whenReady()` intact.

- [ ] **Step 4: Run autoboot test → PASS.**

- [ ] **Step 5: Write + pass the prewarm hook test.** Assert `usePrewarmEngineOnIntent()` returns handlers and that invoking any of them calls the context `startBootstrap` exactly once across repeated calls.

- [ ] **Step 6: Implement `usePrewarmEngineOnIntent.ts`** — read `startBootstrap` from the runtime context; return memoized `{ onPointerEnter, onFocus, onClick }` that each call it (idempotent).

- [ ] **Step 7: typecheck + unit tests → green.**

- [ ] **Step 8: Commit.** `git commit -m "feat(landing): defer engine boot off the landing route + prewarm on intent"`

---

## Task 4: Route the landing page at `/`

**Files:**
- Modify: `frontend/apps/web/src/App.tsx`
- Test: `frontend/apps/web/src/App.rootRoute.test.tsx`

**Interfaces:**
- Consumes: `LandingPage` (Task 5), `useOnboardingStatus()` (existing).
- Produces: `/` renders `<LandingPage/>` when `!hasChart`, redirects to `/dashboard` when `hasChart`. Landing renders outside `AppLayout`.

- [ ] **Step 1: Read `App.tsx`** — note `RootRoute` (≈ 57-65), the `AppLayout` wrapper, the lazy-page pattern, and how routes are declared.

- [ ] **Step 2: Write the failing test.** Render the router at `/` with `hasLocalChart` mocked false → expect landing content (e.g. the hero CTA text) present and `AppLayout` chrome (e.g. profile switcher testid) absent. With `hasLocalChart` true → expect redirect to `/dashboard`.

- [ ] **Step 3: Implement.** Add `const LandingPage = lazy(() => import('./pages/Landing'))`. Change `RootRoute` to `hasChart ? <Navigate to="/dashboard" replace /> : <LandingPage />`. Ensure the `/` route renders the landing **outside** `AppLayout` (move `/` out of the `AppLayout`-wrapped group, or render `AppLayout` only for the app routes). Keep `Suspense` fallback.

- [ ] **Step 4: Run test → PASS. typecheck green.**

- [ ] **Step 5: Commit.** `git commit -m "feat(landing): render LandingPage at / for first-time visitors"`

---

## Task 5: Landing shell — page, nav, footer

**Files:**
- Create: `pages/Landing.tsx`, `components/features/landing/LandingNav.tsx`, `components/features/landing/LandingFooter.tsx`, `components/features/landing/index.ts`
- Test: `pages/Landing.test.tsx`, `components/features/landing/LandingNav.test.tsx`

**Interfaces:**
- Consumes: `landing` namespace (Task 1), `usePrewarmEngineOnIntent` (Task 3), `components/ui/{Button,Logo}`, the language switcher used elsewhere (read `components/features/settings` or `AppLayout` for the existing language selector to reuse).
- Produces: `export default function Landing()`; `LandingNav` and `LandingFooter` consumed only here.

**Use the `frontend-design` skill for the visual implementation.** Observatory tokens, Fraunces headings, brass-gold accents, responsive, a11y baseline, deep-navy background.

- [ ] **Step 1: Write the failing test** — `Landing` renders the nav CTA (`t('landing:nav.cta')`) and a footer link to `/privacy`; the primary CTA is a link to `/onboarding`.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `LandingNav`** — Logo (left); language switcher + CTA `<Link to="/onboarding" {...usePrewarmEngineOnIntent()}>` (right). All strings via `t`.
- [ ] **Step 4: Implement `LandingFooter`** — tagline + links to `/privacy`, `/terms`, `/data-deletion`, GitHub, language switcher.
- [ ] **Step 5: Implement `Landing.tsx`** — full-bleed deep-navy page; renders `LandingNav`, a `<main>` placeholder for sections (filled in Tasks 6–7), `LandingFooter`. `useTranslation('landing')`.
- [ ] **Step 6: Run tests → PASS; typecheck green.**
- [ ] **Step 7: Commit.** `git commit -m "feat(landing): page shell, nav, footer"`

---

## Task 6: Hero with force-field (static fixture, lazy)

**Files:**
- Create: `components/features/landing/Hero.tsx`, `components/features/landing/HeroForceField.tsx`
- Test: `components/features/landing/Hero.test.tsx`

**Interfaces:**
- Consumes: `DEMO_CHART` (Task 2), `ForceFieldExperience` (`components/forcefield/`), `usePrewarmEngineOnIntent`, `landing` namespace, `components/ui/Button`.
- Produces: `Hero` rendered first in `Landing`'s `<main>`.

**Use the `frontend-design` skill.** Headline = `t('landing:hero.headline')`, subhead, CTA, microcopy — all from the spec's approved copy.

- [ ] **Step 1: Write the failing test** — `Hero` renders the headline text and a CTA link to `/onboarding`; `HeroForceField` mounts with `DEMO_CHART` and triggers **no** `@almamesh/browser` import (assert by module-graph: the test importing `HeroForceField` does not pull the engine — keep the import type-safe and static-only).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `HeroForceField`** — `React.lazy`-load or `Suspense`-wrap `ForceFieldExperience` fed `chart={DEMO_CHART}`; render the canvas behind the text. Decorative only; `aria-hidden` on the canvas; respects `prefers-reduced-motion` (static frame if reduced).
- [ ] **Step 4: Implement `Hero`** — headline/subhead (Fraunces/Hanken), primary CTA `<Link to="/onboarding" {...usePrewarmEngineOnIntent()}>{t('hero.cta')}</Link>`, microcopy; lazy hero canvas so text paints first.
- [ ] **Step 5: Wire `Hero` into `Landing`.**
- [ ] **Step 6: Run tests → PASS; typecheck green.**
- [ ] **Step 7: Commit.** `git commit -m "feat(landing): force-field hero from static demo chart"`

---

## Task 7: Content sections

**Files:**
- Create: `WhatSection.tsx`, `ComparisonSection.tsx`, `HowItWorksSection.tsx`, `WhoSection.tsx`, `WhereWhenSection.tsx`, `FounderNote.tsx`, `TrustSection.tsx`, `FinalCta.tsx` (all in `components/features/landing/`)
- Test: one colocated `*.test.tsx` per section asserting it renders its `t()` title/anchor and (where relevant) CTA target.

**Interfaces:**
- Consumes: `landing` namespace, `components/ui/{Card,Button}`, `usePrewarmEngineOnIntent` (FinalCta).
- Produces: sections composed into `Landing`'s `<main>` in spec order (What → Comparison → HowItWorks → Who → WhereWhen → FounderNote → Trust → FinalCta).

**Use the `frontend-design` skill.** Each section pulls all copy from `t('landing:…')`. Specific requirements:
- `ComparisonSection` — renders the `why.anchor` line, then the two-column table from `why.rows[]` (`a` = AlmaMesh, `b` = paid site). Bold, legible, mobile-stacks.
- `FounderNote` — narrower centered column, quieter treatment, paragraphs from `founder.body[]`, signature `founder.signature`. Verbatim approved copy.
- `TrustSection` — Skyfield/DE421/validated/deterministic points from `trust.points[]`.
- `FinalCta` — CTA `<Link to="/onboarding" {...usePrewarmEngineOnIntent()}>`; secondary install-PWA + GitHub.

- [ ] **Step 1 (per section): Write the failing test** (renders title/anchor; FinalCta links to `/onboarding`).
- [ ] **Step 2: Implement the section** with `frontend-design`, copy via `t`.
- [ ] **Step 3: Compose into `Landing`'s `<main>` in order.**
- [ ] **Step 4: Run tests → PASS; typecheck + lint green.**
- [ ] **Step 5: Commit per section or per logical group.** e.g. `git commit -m "feat(landing): WHY comparison + founder note sections"`

---

## Task 8: Live end-to-end validation

**Files:**
- Create: `frontend/apps/web/e2e/landing.spec.ts` (or `scripts/verify-landing.mjs` mirroring existing `verify-*.mjs`)

**Interfaces:** consumes the built+previewed app.

- [ ] **Step 1: Read an existing live gate** (`scripts/verify-exit-gate.mjs` / `verify-i18n.mjs`) to mirror the build+preview+Playwright pattern and the network-capture approach.
- [ ] **Step 2: Write the live test:**
  - Fresh profile → load `/`; assert hero + CTA visible; assert **zero** requests to `/pyodide`, `/bundle`, `/models` while on the landing (capture network).
  - Trigger the CTA (click) → assert navigation to `/onboarding` **and** that engine/bundle requests now begin.
  - Complete onboarding → chart renders on `/dashboard` (no regression).
  - Reload `/` in es and pt (`useLanguageStore`) → landing renders translated; console clean.
- [ ] **Step 3: Build + preview + run the gate → all assertions pass.**
  `cd frontend/apps/web && bun run build && bun run preview &` then run the gate.
- [ ] **Step 4: Commit.** `git commit -m "test(landing): live zero-egress + prewarm + i18n gate"`

---

## Final acceptance (before PR)

- [ ] `bun run --filter '*' typecheck` clean.
- [ ] `bun run --filter @almamesh/web lint` clean.
- [ ] `bun run --filter @almamesh/web test:unit` green (incl. landing parity + unit tests).
- [ ] Build + preview; drive `/` in Playwright Chromium: splash instant + reachable, **zero** engine requests on landing, CTA prewarms + routes to onboarding, chart still renders on `/dashboard`, es/pt correct, console clean.
- [ ] Run the existing `verify-i18n` gate (new `landing` namespace passes).
- [ ] Northstar still A; open PR.

## Self-review notes (author)

- Spec coverage: placement (T4), engine-respect (T3), hero (T2,T6), all 10 sections (T5,T6,T7), i18n (T1), testing+validation (every task + T8). ✔
- The provider/runtime exact code is intentionally "read then adapt" because the live context shape must be followed, not invented — the *behavior* and the `startBootstrap`/prewarm interface are pinned, with tests asserting them.
- Types pinned across tasks: `DEMO_CHART: SiderealChart`, `startBootstrap(): void`, `usePrewarmEngineOnIntent(): {onPointerEnter,onFocus,onClick}`, `landing` key tree (Task 1 interfaces).
