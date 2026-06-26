import { test, expect, type Page, type Download } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

/**
 * Stage-5 REAL end-to-end gate for the beautiful @react-pdf report + the
 * rectified-time fix.
 *
 * Unlike every other e2e suite in this repo, this one drives the app WITHOUT the
 * VITE_EXIT_GATE_HOOKS observability/seed hooks. It exercises the ACTUAL
 * onboarding -> engine-bootstrap -> Generate -> dashboard journey a real visitor
 * walks (the project scar: the hooked gate bypasses real onboarding and once
 * shipped a permanently-stuck first run CI-green). It then:
 *
 *   1. rectifies the birth time on /settings/profile (06:44 -> 06:14) and saves,
 *   2. reloads and asserts the rectified time PERSISTS (entered 06:44, effective
 *      06:14, lagna flips Leo -> Cancer),
 *   3. opens /report, clicks "Download PDF" (natal-only graceful path, no LLM),
 *   4. parses the downloaded PDF and asserts the cover / birth-time / lagna /
 *      "Generated on <today>" (no 1969/1970 epoch) are correct.
 *
 * The proof case is the reference native: Bengaluru, India, 08 Aug 1988, 06:44 IST.
 * The lagna sits on the Cancer / Leo cusp:
 *   - 06:44 -> Leo ~0deg (original)
 *   - 06:14 -> Cancer (rectified, stepping the time earlier crosses into Cancer)
 *
 * Build NON-hooked + preview before running (see playwright.report-pdf.config.ts).
 * Run:  bun run test:e2e:report:pdf   (from apps/web)
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../.report-out');
const DOWNLOAD_PATH = resolve(OUT_DIR, 'e2e-download.pdf');
const DASHBOARD_SHOT = resolve(OUT_DIR, 'e2e-dashboard.png');
const REPORT_SHOT = resolve(OUT_DIR, 'e2e-report.png');

// ---------------------------------------------------------------------------
// Console hygiene: collect page errors + console.error for the clean-console
// assertion. We tolerate known-benign noise (favicon, third-party LLM probes
// the user never opted into here, ResizeObserver loop warnings).
// ---------------------------------------------------------------------------
const BENIGN = [
  /favicon/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  // The optional LLM endpoint is never configured in this keyless gate; any
  // interpretation probe failing is expected and NOT a report/onboarding bug.
  /openrouter|interpretation|llm/i,
];

function collectConsole(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN.some((re) => re.test(text))) return;
    errors.push(`[console.error] ${text}`);
  });
  page.on('pageerror', (err) => {
    const text = String(err);
    if (BENIGN.some((re) => re.test(text))) return;
    errors.push(`[pageerror] ${text}`);
  });
  return { errors };
}

/**
 * Type a value into ONE segment of a MUI X "section list" picker (DatePicker /
 * TimePicker). These fields are NOT a plain <input>: the visible field is a
 * contenteditable container with per-segment spinbuttons (Month/Day/Year, or
 * Hours/Minutes/Meridiem) and the real <input> is aria-hidden + pointer-events-
 * intercepted, so click the addressed spinbutton segment and type into it.
 */
async function typeSection(
  page: Page,
  testId: string,
  ariaLabel: string,
  keys: string,
): Promise<void> {
  const seg = page.getByTestId(testId).locator(`[role="spinbutton"][aria-label="${ariaLabel}"]`).first();
  await seg.click();
  await page.keyboard.type(keys, { delay: 40 });
}

/**
 * Fill the MUI DatePicker as 08/08/1988. CRITICAL ORDER: Year, then Month, then
 * Day. Typing the year LAST re-clamps the day (MUI re-validates the day segment
 * when a later segment changes), so the day must be the final segment entered.
 * Verified live against the production build.
 */
async function fillDatePicker(page: Page, testId: string): Promise<void> {
  const container = page.getByTestId(testId).locator('.MuiPickersSectionList-root').first();
  await container.waitFor({ state: 'visible', timeout: 15_000 });
  await typeSection(page, testId, 'Year', '1988');
  await typeSection(page, testId, 'Month', '08');
  await typeSection(page, testId, 'Day', '08');
  await page.keyboard.press('Escape'); // close any popper so the next click hits Next
}

/** Fill the MUI TimePicker as 06:44 AM. */
async function fillTimePicker(page: Page, testId: string): Promise<void> {
  const container = page.getByTestId(testId).locator('.MuiPickersSectionList-root').first();
  await container.waitFor({ state: 'visible', timeout: 15_000 });
  await typeSection(page, testId, 'Hours', '06');
  await typeSection(page, testId, 'Minutes', '44');
  // The meridiem segment has no stable aria-label; it is the last spinbutton.
  await page.getByTestId(testId).locator('[role="spinbutton"]').last().click();
  await page.keyboard.press('a'); // AM
  await page.keyboard.press('Escape'); // close the popper
}

const NEXT = '[data-testid="next-button"]';

/**
 * Click "Continue" and wait for the step to actually advance (the expected next
 * locator to appear). After a MUI picker edit the FIRST Next click can be
 * consumed closing the picker popper / committing a blur, so retry up to a few
 * times until the next step is visibly mounted. This mirrors what a real user
 * does (clicks again when nothing happened) and keeps the gate honest.
 */
async function advanceStep(page: Page, nextStepLocator: () => ReturnType<Page['locator']>): Promise<void> {
  await expect(page.locator(NEXT)).toBeEnabled({ timeout: 15_000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.locator(NEXT).click();
    try {
      await nextStepLocator().waitFor({ state: 'visible', timeout: 6_000 });
      return;
    } catch {
      // Step didn't advance (popper consumed the click) — try again.
    }
  }
  // Final attempt surfaces the real error if it still hasn't advanced.
  await nextStepLocator().waitFor({ state: 'visible', timeout: 6_000 });
}

/**
 * Drive REAL onboarding from a clean state through to /dashboard, returning when
 * a chart has rendered. NO seed hooks — this is the genuine first-run journey.
 */
async function driveRealOnboarding(page: Page): Promise<void> {
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });

  // Step 1 — name.
  await page.getByTestId('name-input').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('name-input').fill('Reference Native');
  await advanceStep(page, () => page.getByTestId('birth-date-input'));

  // Step 2 — birth date (MUI DatePicker -> 08/08/1988).
  await fillDatePicker(page, 'birth-date-input');
  await advanceStep(page, () => page.getByTestId('location-search-input'));

  // Step 3 — birth location (offline city DB). Type "Bengaluru", select India.
  const locInput = page.getByTestId('location-search-input');
  await locInput.fill('Bengaluru');
  const cityResult = page.locator('button:has-text("India")').first();
  await expect(cityResult).toBeVisible({ timeout: 10_000 });
  await cityResult.click();
  await advanceStep(page, () => page.getByTestId('birth-time-input'));

  // Step 4 — birth time (MUI TimePicker -> 06:44 AM).
  await fillTimePicker(page, 'birth-time-input');
  await advanceStep(page, () => page.getByTestId('life-events-input'));

  // Step 5 — life events: skip (uses approximate time) -> generate the chart.
  const skip = page.getByRole('button', { name: /Skip - I'll use approximate birth time/i });
  await skip.waitFor({ state: 'visible', timeout: 15_000 });
  await skip.click();

  // The generating screen now WAITS for the ~38MB engine bootstrap, then
  // navigates to /dashboard. Be patient (cold Pyodide boot + OPFS bundle sync).
  await page.waitForURL('**/dashboard', { timeout: 180_000 });
}

/** Poll the dashboard until the real chart has rendered (no seed hook). */
async function waitForDashboardChart(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText || '';
      if (/chart data not available/i.test(text)) return false;
      // Real chart evidence: the dashboard shows the person + dasha/identity
      // strip once a chart is loaded. Use a robust signal: SVG kundli or the
      // ascendant/lagna readout present.
      const svgCount = document.querySelectorAll('svg').length;
      const hasLagna = /ascendant|lagna|leo|cancer/i.test(text);
      return svgCount >= 2 && hasLagna && text.length > 200;
    },
    { timeout: 60_000, polling: 1000 },
  );
}

/** SPA-navigate without a hard reload so the booted engine singleton survives. */
async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/**
 * Read the LAGNA (ascendant) sign from the dashboard IdentityStrip — SCOPED, not
 * a whole-body text scan. Whole-body text can contain BOTH "Leo" and "Cancer"
 * because planets occupy many signs regardless of the rising sign, so a body-wide
 * `toContain('leo')` is meaningless. The IdentityStrip's "Lagna · Ascendant" fact
 * is the rising sign.
 */
async function readDashboardLagna(page: Page): Promise<string> {
  const lagnaFact = page
    .getByTestId('identity-strip')
    .locator('div', { has: page.locator('dt', { hasText: 'Lagna · Ascendant' }) })
    .first()
    .locator('dd')
    .first();
  await lagnaFact.waitFor({ state: 'visible', timeout: 30_000 });
  return (await lagnaFact.innerText()).trim().toLowerCase();
}

/** Extract the text of the downloaded PDF via the system `pdftotext`. */
async function pdfToText(pdfPath: string): Promise<string> {
  const txtPath = pdfPath.replace(/\.pdf$/, '.txt');
  await execFileAsync('pdftotext', ['-layout', pdfPath, txtPath]);
  return readFile(txtPath, 'utf8');
}

/** The single "ASCENDANT (LAGNA)" birth-detail line from the PDF text. */
function pdfAscendantLine(pdfText: string): string {
  return (pdfText.split('\n').find((l) => /ascendant\s*\(lagna\)/i.test(l)) ?? '').trim();
}

test('REAL onboarding -> rectify (persists) -> natal-only PDF is correct', async ({ page }) => {
  test.setTimeout(360_000);
  const { errors } = collectConsole(page);
  await mkdir(OUT_DIR, { recursive: true });

  // ---- 1. REAL onboarding through the live engine bootstrap to /dashboard ----
  await driveRealOnboarding(page);
  await waitForDashboardChart(page);
  await page.screenshot({ path: DASHBOARD_SHOT, fullPage: true });

  // Clean-console gate for the onboarding -> dashboard journey.
  expect(errors, `console errors during onboarding/dashboard:\n${errors.join('\n')}`).toEqual([]);

  // Sanity: at the entered 06:44 the engine yields the Leo cusp case. Read
  // the SCOPED IdentityStrip lagna, not whole-body text (planets sit in many signs).
  const lagna0644 = await readDashboardLagna(page);
  console.log('[report-pdf] dashboard lagna @06:44 =', JSON.stringify(lagna0644));
  expect(lagna0644, 'at 06:44 the dashboard lagna should be Leo (pre-rectification)').toContain('leo');

  // ---- 2. Rectify 06:44 -> 06:14 on /settings/profile, save, regenerate ----
  await spaNavigate(page, '/settings/profile');
  const rectifyInput = page
    .locator('div', { has: page.getByRole('heading', { name: 'Birth time rectification' }) })
    .last()
    .locator('input[type="time"]')
    .first();
  await expect(rectifyInput).toBeVisible({ timeout: 30_000 });
  await rectifyInput.fill('06:14');
  await rectifyInput.blur();

  // Save Changes -> confirm in the regeneration modal -> "Chart Updated!" card.
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.getByRole('button', { name: 'Confirm & Regenerate' }).click();
  // The on-device regenerate then shows a success card with a "View New Chart" CTA.
  const viewNewChart = page.getByRole('button', { name: /View New Chart/i });
  await expect(viewNewChart, 'rectification must regenerate the chart on-device').toBeVisible({
    timeout: 90_000,
  });
  await viewNewChart.click();

  // Back on the dashboard, the SCOPED lagna must have flipped to Cancer. POLL —
  // the IdentityStrip re-renders from the store a beat after the regenerate
  // commits; a single read can catch the pre-update frame.
  await waitForDashboardChart(page);
  await expect
    .poll(() => readDashboardLagna(page), {
      timeout: 30_000,
      message: 'after rectifying to 06:14 the dashboard lagna must flip to Cancer',
    })
    .toContain('cancer');
  const lagnaAfterRectify = await readDashboardLagna(page);
  console.log('[report-pdf] dashboard lagna @06:14 =', JSON.stringify(lagnaAfterRectify));
  expect(lagnaAfterRectify, 'after rectifying the lagna must no longer be Leo').not.toContain('leo');

  // ---- 3. RELOAD and prove the rectified time PERSISTED ----
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await waitForDashboardChart(page);
  await expect
    .poll(() => readDashboardLagna(page), {
      timeout: 30_000,
      message: 'after reload the rectified lagna (Cancer) must persist',
    })
    .toContain('cancer');
  const lagnaAfterReload = await readDashboardLagna(page);
  console.log('[report-pdf] dashboard lagna after reload =', JSON.stringify(lagnaAfterReload));
  expect(lagnaAfterReload, 'after reload the lagna must NOT revert to Leo').not.toContain('leo');

  // ---- 4. /report -> Download PDF (natal-only graceful path, no LLM) ----
  await spaNavigate(page, '/report');
  const downloadBtn = page.getByTestId('report-download-pdf');
  await expect(downloadBtn).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('report-document')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: REPORT_SHOT, fullPage: true });

  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    downloadBtn.click(),
  ]);
  await download.saveAs(DOWNLOAD_PATH);

  // ---- 5. Parse the PDF text and ASSERT correctness ----
  const pdfText = await pdfToText(DOWNLOAD_PATH);
  await writeFile(resolve(OUT_DIR, 'e2e-download.assertions.txt'), pdfText, 'utf8');

  // 5a. The "generated on" date is TODAY (epoch-safe — the `new Date(0)` bug
  // would print 1969/1970). The cover renders the locale-formatted date
  // ("June 20, 2026"); assert today's exact long-form date is present and that
  // no Unix-epoch year leaks anywhere in the document.
  const today = new Date();
  const todayLong = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const dateLine = (pdfText.split('\n').find((l) => l.includes(todayLong)) ?? '').trim();
  expect(pdfText, `the PDF must carry today's generated-on date ("${todayLong}")`).toContain(todayLong);
  expect(pdfText, 'the PDF must NOT show the Unix-epoch year 1969').not.toMatch(/\b1969\b/);
  expect(pdfText, 'the PDF must NOT show the Unix-epoch year 1970').not.toMatch(/\b1970\b/);

  // 5b. Birth time shows the rectified 6:14 AM (not the original 6:44 AM). The
  // cover renders a 12-hour clock ("6:14 AM (Asia/Kolkata)").
  const timeOfBirthLine = (pdfText.split('\n').find((l) => /time of birth/i.test(l)) ?? '').trim();
  expect(timeOfBirthLine, 'the PDF must carry a "Time of Birth" line').toMatch(/time of birth/i);
  expect(timeOfBirthLine, 'the PDF birth-time must be the rectified 6:14 AM').toContain('6:14 AM');
  expect(timeOfBirthLine, 'the PDF birth-time must NOT be the original 6:44 AM').not.toContain('6:44');

  // 5c. Lagna / ascendant is Cancer (the rectified result), not Leo. SCOPE
  // to the "ASCENDANT (LAGNA)" birth-detail line — the PDF body may legitimately
  // name Leo elsewhere (planets occupy many signs regardless of the rising sign).
  const ascLine = pdfAscendantLine(pdfText).toLowerCase();
  expect(ascLine, 'the PDF must carry an "Ascendant (Lagna)" line').toMatch(/ascendant\s*\(lagna\)/i);
  expect(ascLine, 'the PDF ascendant must be Cancer (the rectified result)').toContain('cancer');
  expect(ascLine, 'the PDF ascendant must NOT be the original Leo').not.toContain('leo');

  // 5d. The natal sections are present (multi-page deterministic report).
  expect(pdfText, 'PDF must include the person name').toContain('Reference Native');
  expect(pdfText.toLowerCase(), 'PDF must include the birth place').toContain('bengaluru');
  // Multi-page: the report carries the deterministic natal sections. Assert a
  // few section headers are present (cover + planets + dasha + yogas).
  expect(pdfText.toLowerCase(), 'PDF must include the planetary-positions section').toContain('nakshatra');
  // The dasha section header renders as "Vimshottari Dasa" (engine spelling).
  expect(pdfText.toLowerCase(), 'PDF must include the Vimshottari dasa section').toMatch(/vimshottari|dasa/);
  expect(pdfText.toLowerCase(), 'PDF must include the yogas section').toContain('yoga');

  // Surface the load-bearing lines in the test log as evidence.
  console.log('[report-pdf] generated-on date :', JSON.stringify(dateLine || todayLong));
  console.log('[report-pdf] time-of-birth line:', JSON.stringify(timeOfBirthLine));
  console.log('[report-pdf] ascendant line    :', JSON.stringify(pdfAscendantLine(pdfText)));

  // Final clean-console gate across the whole journey.
  expect(errors, `console errors during the full journey:\n${errors.join('\n')}`).toEqual([]);
});
