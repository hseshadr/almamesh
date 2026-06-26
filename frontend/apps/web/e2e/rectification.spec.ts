import { test, expect, type Page } from '@playwright/test';

import {
  bootEngine,
  seedChart,
  waitForEngineReady,
  type SeedBirthSpec,
} from './interpretation.helpers';

/**
 * Birth-time rectification LIVE PREVIEW "human test" — REAL engine, NO LLM.
 *
 * Proves the new rectification panel on /settings/profile recomputes the
 * Ascendant (Lagna) LIVE as the user nudges the rectified birth time, calling
 * the same in-browser Pyodide engine the dashboard uses. Because this path is
 * LLM-free it is fully deterministic and keyless — CI-safe.
 *
 * The proof case is the reference native: Bengaluru, India, 08 Aug 1988,
 * 06:44 local (Asia/Kolkata). The lagna sits on the Cancer / Leo cusp:
 *   - 06:44 -> Leo ~0deg, WITH a cusp warning naming Cancer
 *   - 06:14 -> Cancer ~23deg (stepping the time EARLIER crosses back into Cancer)
 *
 * WHY build+preview (mirrors playwright.interpretation.config.ts): the app's
 * module Workers (the Pyodide chart Worker) only RESOLVE in a production build,
 * and VITE_EXIT_GATE_HOOKS=1 exposes window.__almameshGenerate /
 * window.__ALMAMESH_STAGE__ for booting + seeding the chart.
 *
 * Run:  bun run test:e2e:rectification   (from apps/web)
 */

// ---------------------------------------------------------------------------
// The reference native. Bengaluru, India, 08 Aug 1988, 06:44 Asia/Kolkata.
// IST is a fixed UTC+5:30 (no DST), so 06:44 local == 01:14 UTC.
// referenceDate pins the dasha "now" for determinism (unused by the lagna here
// but kept identical to the dashboard's real chart path).
//
// Seeded THROUGH the real engine (seedChart), not hand-stubbed: the stored-
// chart contract requires a full `sidereal_ctx` (planets + lagna are
// non-optional — the dashboard reads `sidereal_ctx.planets` at mount), and an
// earlier hand-crafted stub without them crashed the app to the ErrorBoundary
// before this spec ever reached /settings/profile. birthDatetimeLocal carries
// the 06:44 wall clock so the form and rectified-time field initialise to it.
// ---------------------------------------------------------------------------
const REFERENCE_SEED: SeedBirthSpec = {
  name: 'Reference Native',
  datetimeUtc: '1988-08-08T01:14:00.000Z',
  latitude: 12.9716,
  longitude: 77.5946,
  referenceDate: '2025-01-01T00:00:00+00:00',
  chartId: 'rectify-reference-1988',
  birthDatetimeLocal: '1988-08-08T06:44:00',
  timezone: 'Asia/Kolkata',
  city: 'Bengaluru',
  state: 'Karnataka',
  country: 'India',
  locationName: 'Bengaluru, Karnataka, India',
  timeConfidence: 'approximate',
};

const RECTIFY_DIR = '/tmp/almamesh-rectify';

/**
 * The live Ascendant read-out container (sign + degree + nakshatra + cusp). The
 * preview <div> always renders one status <p> ("Ascendant: …" when ready, else
 * "Calculating…" / "unavailable" / etc.), so we scope to the panel and read the
 * single text-sm bordered preview card that holds whichever status is current.
 */
function readOut(page: Page) {
  return rectifyPanel(page)
    .locator('div')
    .filter({ hasText: /Ascendant:|Calculating|preview (the Ascendant|unavailable)|Set a birth/ })
    .last();
}

/**
 * Poll the live read-out until it contains `needle` (case-insensitive). The
 * preview is debounced ~300ms then runs on the real engine, so we wait up to
 * ~30s for the async result to land before failing.
 *
 * 30s (with headroom): the dashboard's LifeAtlas auto-compute (~30s Pyodide
 * run) no longer starves this interactive call. usePredictiveLayer DEFERS the
 * auto kickoff and CANCELS it on unmount, so SPA-navigating away from the
 * dashboard (which this test does before touching the rectified time) frees the
 * serial engine thread for the live Ascendant preview rather than queuing it
 * behind the predictive job. 30s comfortably covers the debounce + a single
 * unobstructed engine call.
 */
async function expectReadOutContains(page: Page, needle: string, why: string) {
  await expect
    .poll(
      async () => {
        const visible = await readOut(page).isVisible().catch(() => false);
        const text = visible ? ((await readOut(page).textContent()) ?? '') : '';
        return text.toLowerCase();
      },
      { timeout: 30_000, message: why, intervals: [500, 1000] },
    )
    .toContain(needle.toLowerCase());
}

/**
 * SPA-navigate to a route WITHOUT a full document reload, so the already-booted
 * engine singleton (and the AlmaMeshRuntimeProvider holding it) stays alive.
 *
 * WHY not page.goto: a hard load of a NESTED route (e.g. /settings/profile) sets
 * document.baseURI to that nested path, and the runtime resolves its pinned
 * `public.key` relative to baseURI -> `/settings/public.key` (a 404), so the
 * bundle signature re-verification fails and the engine never re-boots. A real
 * user reaches Settings by clicking (client-side routing), never a hard refresh,
 * so we mirror that: push the path and let BrowserRouter pick up the popstate.
 */
async function spaNavigate(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/**
 * The rectification panel: the bordered card whose heading is "Birth time
 * rectification". The label/input pairs inside are NOT htmlFor-associated, so
 * we scope by the panel and pick its (only) time input rather than getByLabel.
 */
function rectifyPanel(page: Page) {
  return page
    .locator('div', { has: page.getByRole('heading', { name: 'Birth time rectification' }) })
    .last();
}

/** The "Rectified time" field — the single time input inside the panel. */
function rectifiedTimeInput(page: Page) {
  return rectifyPanel(page).locator('input[type="time"]').first();
}

/** Set the rectified-time field to an HH:MM value and commit it. */
async function setRectifiedTime(page: Page, hhmm: string) {
  const field = rectifiedTimeInput(page);
  await field.fill(hhmm);
  // `type="time"` inputs need an explicit change/blur to commit in headless.
  await field.blur();
}

test('rectification live preview: Leo+Cancer-cusp at 06:44, flips to Cancer at 06:14', async ({
  page,
}) => {
  // 1. Boot the REAL in-browser engine (no chart yet, so '/' lands on
  //    onboarding), then generate + persist the reference chart THROUGH the
  //    engine as the primary chart (full sidereal_ctx — see REFERENCE_SEED note).
  await bootEngine(page);
  const seeded = await seedChart(page, { birth: REFERENCE_SEED });
  // Sanity: the REAL engine computed the cusp case (Leo lagna at 06:44).
  expect(String(seeded.lagna).toLowerCase()).toBe('leo');

  // 2. Hard-load /dashboard so the chart-library store re-hydrates with the
  //    seeded chart (a single-segment route — the pinned public.key still
  //    resolves; mirrors interpretation.spec.ts). The reload re-boots the
  //    engine and the live preview needs it, so wait for ready again.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await waitForEngineReady(page);

  // 3. SPA-navigate to the profile settings page (no reload) so the engine
  //    stays ready — the live preview reads it via useChartEngine.
  await spaNavigate(page, '/settings/profile');

  // The panel + its rectified-time field must be present (feature is reachable).
  await expect(
    page.getByRole('heading', { name: 'Birth time rectification' }),
    'the "Birth time rectification" panel renders on /settings/profile',
  ).toBeVisible({ timeout: 30_000 });
  await expect(rectifiedTimeInput(page)).toBeVisible();

  // 4. Set the rectified time to 06:44 and assert the live read-out: the engine
  //    returns Leo, and the cusp warning names Cancer.
  await setRectifiedTime(page, '06:44');
  await expectReadOutContains(
    page,
    'Leo',
    'at 06:44 the live Ascendant read-out must report Leo',
  );
  const at0644 = ((await readOut(page).textContent()) ?? '').trim();

  // The cusp warning (separate paragraph) must mention the neighbouring sign.
  const cuspWarning = page.locator('p', { hasText: 'cusp' }).first();
  await expect(
    cuspWarning,
    'at 06:44 a cusp warning must be shown (lagna is near a sign boundary)',
  ).toBeVisible({ timeout: 12_000 });
  await expect(
    cuspWarning,
    'the cusp warning must name Cancer as the adjacent sign about to be crossed',
  ).toContainText('Cancer');
  const cuspText = ((await cuspWarning.textContent()) ?? '').trim();

  await page.screenshot({ path: `${RECTIFY_DIR}/06-44.png`, fullPage: true });

  // 5. Step the rectified time EARLIER to 06:14; the lagna must flip to Cancer.
  await setRectifiedTime(page, '06:14');
  await expectReadOutContains(
    page,
    'Cancer',
    'at 06:14 the live Ascendant read-out must flip to Cancer',
  );
  const at0614 = ((await readOut(page).textContent()) ?? '').trim();

  await page.screenshot({ path: `${RECTIFY_DIR}/06-14.png`, fullPage: true });

  // Surface the exact verbatim read-outs in the test log as evidence.
  console.log('[rectify] read-out @06:44:', JSON.stringify(at0644));
  console.log('[rectify] cusp    @06:44:', JSON.stringify(cuspText));
  console.log('[rectify] read-out @06:14:', JSON.stringify(at0614));

  // Hard guards: 06:14 must NOT still read Leo (proves it actually updated).
  expect(
    at0614.toLowerCase(),
    'at 06:14 the read-out must no longer say Leo (the lagna genuinely flipped)',
  ).not.toContain('leo');
});
