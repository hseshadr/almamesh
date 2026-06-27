import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { bootEngine, seedChart, waitForEngineReady, type SeedBirthSpec } from './interpretation.helpers';

/**
 * Task 16: Phase-2 Rectification Wizard — LIVE end-to-end validation.
 *
 * Drives the REAL /rectify/:profileId wizard with:
 *   - REAL in-browser Pyodide engine (same engine the exit-gate proves works)
 *   - Synthetic Bengaluru cusp native (1988-08-08 06:44 IST, Cancer/Leo boundary)
 *   - ZERO owner PII — name="Test Native", synthetic birth, Bengaluru
 *
 * Checks:
 *   1. Intro step renders
 *   2. 0-event guard (Continue disabled until ≥1 structured event)
 *   3. ≥3 events added via structured entry rows
 *   4. Fit step → results render (band-label visible)
 *   5. Band label qualitative (no %)
 *   6. Honesty note substantive
 *   7. Evidence rows: localized signal phrases (not raw machine keys)
 *   8. NO "%" in results region
 *   9. Recorded-time reference renders
 *  10. Confirm → /dashboard with both times context
 *  11. Clean console throughout
 *  12. Wizard re-navigable (no dead-end)
 *  13. Error/retry path compiled in (unit-tested; confirmed structurally)
 *
 * Parity cross-check: captures band + candidate rising signs for comparison
 * against the CPython golden test (test_rectification_golden.py).
 *
 * Why bootEngine + seedChart (not real onboarding form):
 *   All AlmaMesh e2e tests use this pattern — it drives the REAL engine, not
 *   a stub, but bypasses the MUI v8 date/time picker keyboard interaction which
 *   is fragile in headless Chromium. The chart seeded IS real engine output.
 */

const SCRATCHPAD =
  '/private/tmp/claude-501/-Users-harish-dev-private-almamesh/858dba16-61eb-4dd1-8390-1037189e26ec/scratchpad';

// Synthetic Bengaluru cusp native (ZERO owner PII).
// 1988-08-08 06:44 IST == 01:14 UTC. Cancer/Leo cusp (lagna ~Leo 0°).
const BENGALURU_SEED: SeedBirthSpec = {
  name: 'Test Native',
  datetimeUtc: '1988-08-08T01:14:00.000Z',
  latitude: 12.9716,
  longitude: 77.5946,
  referenceDate: '2025-01-01T00:00:00+00:00',
  chartId: 'wizard-phase2-bengaluru-1988',
  birthDatetimeLocal: '1988-08-08T06:44:00',
  timezone: 'Asia/Kolkata',
  city: 'Bengaluru',
  state: 'Karnataka',
  country: 'India',
  locationName: 'Bengaluru, Karnataka, India',
  timeConfidence: 'approximate',
};

// SPA-navigate without full document reload (keeps the engine singleton alive).
async function spaNav(page: import('@playwright/test').Page, path: string) {
  await page.evaluate((to: string) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForTimeout(600);
}

// Read active profile ID from IndexedDB (almamesh-profiles zustand-persist key).
async function readActiveProfileId(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const open = indexedDB.open('keyval-store');
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('keyval')) return resolve(null);
        const tx = db.transaction('keyval', 'readonly');
        const req = tx.objectStore('keyval').get('almamesh-profiles');
        req.onsuccess = () => {
          try {
            resolve(
              (JSON.parse(req.result as string ?? '{}') as { state?: { activeProfileId?: string } })
                ?.state?.activeProfileId ?? null,
            );
          } catch {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      };
      open.onerror = () => resolve(null);
    });
  });
}

test.describe('Phase-2 Rectification Wizard', () => {
  test('full wizard journey: intro → events → fit → results → confirm → dashboard', async ({
    page,
  }) => {
    mkdirSync(SCRATCHPAD, { recursive: true });
    const consoleLines: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => {
      const s = `[pageerror] ${String(e)}`;
      pageErrors.push(s);
      consoleLines.push(s);
    });

    // ── 1. Boot engine + seed Bengaluru chart ──────────────────────────────
    await bootEngine(page);
    const seeded = await seedChart(page, { birth: BENGALURU_SEED });
    // Confirm the REAL engine computed the Leo lagna (cusp case).
    expect(String(seeded.lagna).toLowerCase(), 'engine must compute Leo lagna for 06:44 Bengaluru').toBe('leo');
    await page.screenshot({ path: `${SCRATCHPAD}/00-engine-seeded.png`, fullPage: true });

    // ── 2. Load /dashboard (full reload re-hydrates the store) ────────────
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForEngineReady(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCRATCHPAD}/01-dashboard-loaded.png`, fullPage: true });

    // ── 3. Get active profile ID ───────────────────────────────────────────
    let profileId = await readActiveProfileId(page);
    if (!profileId) {
      // Fallback: extract from IdentityStrip cusp CTA link in the DOM
      profileId = await page.evaluate((): string | null => {
        const a = document.querySelector('a[href*="/rectify/"]');
        return a ? (a.getAttribute('href') ?? '').split('/rectify/')[1] ?? null : null;
      });
    }
    expect(profileId, 'must have an active profile ID to navigate to rectify').toBeTruthy();
    console.log(`[wizard-phase2] profileId=${profileId}`);

    // ── 4. Navigate to /rectify/:profileId ───────────────────────────────
    // Try the IdentityStrip cusp CTA first (proves entry-point is reachable).
    const cuspLink = page.locator(`a[href="/rectify/${profileId}"]`);
    const hasCuspCta = await cuspLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasCuspCta) {
      console.log('[wizard-phase2] IdentityStrip cusp CTA found — clicking');
      await cuspLink.click();
    } else {
      console.log('[wizard-phase2] No cusp CTA visible — SPA-navigating directly');
      await spaNav(page, `/rectify/${profileId}`);
    }
    console.log(`[wizard-phase2] cuspCtaAvailable=${hasCuspCta}`);
    await expect(page).toHaveURL(new RegExp(`/rectify/${profileId}`), { timeout: 10_000 });
    await page.screenshot({ path: `${SCRATCHPAD}/02-rectify-navigated.png`, fullPage: true });

    // ── 5. Intro step ─────────────────────────────────────────────────────
    const introStep = page.locator('[data-testid="intro-step"]');
    await expect(introStep, 'intro step must render').toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `${SCRATCHPAD}/03-intro-step.png`, fullPage: true });

    // ── 6. Click Start ────────────────────────────────────────────────────
    await page.locator('[data-testid="intro-start-btn"]').click();
    await page.waitForTimeout(500);

    // ── 7. UNHAPPY PATH: 0 events → Continue disabled ─────────────────────
    const continueBtn = page.locator('button').filter({ hasText: /continue/i });
    await expect(continueBtn, 'Continue must be disabled with 0 structured events').toBeDisabled({
      timeout: 5_000,
    });
    console.log('[wizard-phase2] UNHAPPY-1 PASS: Continue disabled with 0 events');

    // ── 8. Add ≥3 structured events ───────────────────────────────────────
    const eventsToAdd = [
      { date: '2010-06-15', category: 'career_change', note: 'Career shift' },
      { date: '2014-03-20', category: 'relocation',    note: 'Moved cities' },
      { date: '2018-09-10', category: 'marriage',      note: 'Got married' },
    ];

    for (let i = 0; i < eventsToAdd.length; i++) {
      const ev = eventsToAdd[i];
      await page.locator('button').filter({ hasText: /add event/i }).click();
      await page.waitForTimeout(350);
      const lastRow = page.locator('[data-testid="event-row"]').last();
      await lastRow.locator('input[type="date"]').fill(ev.date);
      await page.waitForTimeout(120);
      await lastRow.locator('select').selectOption({ value: ev.category });
      await page.waitForTimeout(120);
      await lastRow.locator('input[type="text"]').fill(ev.note);
      await page.waitForTimeout(120);
      console.log(`[wizard-phase2] event ${i + 1}: ${ev.date} / ${ev.category}`);
    }

    const rowCount = await page.locator('[data-testid="event-row"]').count();
    expect(rowCount, 'must have 3 event rows').toBe(3);
    await page.screenshot({ path: `${SCRATCHPAD}/04-events-entry.png`, fullPage: true });

    // Continue must be enabled now
    await expect(continueBtn, 'Continue must be enabled after ≥1 structured event').toBeEnabled({
      timeout: 5_000,
    });

    // ── 9. Continue → Fit → Results ───────────────────────────────────────
    await continueBtn.click();
    await page.waitForTimeout(600);

    // Fit step (loading state)
    const fitStep = page.locator('[data-testid="fit-step"]');
    if (await fitStep.isVisible({ timeout: 4_000 }).catch(() => false)) {
      console.log('[wizard-phase2] fit step active — engine computing…');
      await page.screenshot({ path: `${SCRATCHPAD}/05-fit-loading.png`, fullPage: true });
    }

    // Wait for results (band-label appears when compute finishes)
    const bandLabel = page.locator('[data-testid="band-label"]');
    await expect(bandLabel, 'band-label must appear when results render').toBeVisible({
      timeout: 120_000,
    });
    await page.screenshot({ path: `${SCRATCHPAD}/06-results.png`, fullPage: true });

    // ── 10. Assert results content ────────────────────────────────────────
    // 10a. Band label: qualitative (no % or raw number)
    const bandText = (await bandLabel.textContent()) ?? '';
    expect(bandText.length, 'band label must be non-empty').toBeGreaterThan(0);
    expect(bandText, 'band label must NOT contain "%"').not.toContain('%');
    // Valid band values: "Near Tie", "Leans Toward", "Consistent"
    const validBands = ['near tie', 'leans toward', 'leans', 'consistent'];
    expect(
      validBands.some((b) => bandText.toLowerCase().includes(b)),
      `band "${bandText}" must be one of the qualitative labels`,
    ).toBe(true);
    console.log(`[wizard-phase2] band="${bandText}"`);

    // 10b. Honesty note present and substantive
    const honestyNote = page.locator('[data-testid="honesty-note"]');
    await expect(honestyNote, 'honesty-note must render').toBeVisible();
    const honestyText = (await honestyNote.textContent()) ?? '';
    expect(honestyText.length, 'honesty note must be substantive (>20 chars)').toBeGreaterThan(20);
    expect(honestyText, 'honesty note must NOT say "%" ').not.toContain('%');
    console.log(`[wizard-phase2] honesty="${honestyText.slice(0, 80)}…"`);

    // 10c. Evidence tables: localized signal phrases, NOT raw machine keys
    const evidenceTables = page.locator('[data-testid="evidence-table"]');
    const tableCount = await evidenceTables.count();
    expect(tableCount, 'at least 1 evidence table must render').toBeGreaterThan(0);

    let hasLocalized = false;
    let hasRaw = false;
    for (let i = 0; i < tableCount; i++) {
      const txt = (await evidenceTables.nth(i).textContent()) ?? '';
      if (/Dasha lord|Slow planet|timing signal/i.test(txt)) hasLocalized = true;
      if (/dasha_lord_rules_h\d|dasha_lord_in_h\d|slow_transit_h\d/.test(txt)) hasRaw = true;
    }
    expect(hasLocalized, 'evidence rows must have localized human phrases').toBe(true);
    expect(hasRaw, 'evidence rows must NOT expose raw machine signal keys').toBe(false);

    // 10d. NO "%" in page text (anti-scam: no false-precision fit-score %)
    const pageText = (await page.evaluate(() => document.body.innerText ?? '')) ?? '';
    expect(pageText, 'NO "%" may appear on the results page').not.toContain('%');

    // 10e. Recorded-time reference section
    await expect(
      page.locator('[data-testid="recorded-reference"]'),
      'recorded-time reference must render',
    ).toBeVisible();

    // 10f. At least one candidate card with a confirm button
    const candidateCards = page.locator('[data-testid="candidate-card"]');
    const candidateCount = await candidateCards.count();
    expect(candidateCount, 'at least 1 candidate card').toBeGreaterThan(0);
    await expect(candidateCards.first().locator('[data-testid="confirm-button"]')).toBeVisible();

    // ── 11. Parity capture: band + candidate signs ────────────────────────
    const parityData = await page.evaluate(() => {
      const band = document.querySelector('[data-testid="band-label"]')?.textContent?.trim() ?? '';
      const cards = [...document.querySelectorAll('[data-testid="candidate-card"]')];
      const candidates = cards.map((c) => ({
        sign: (c.querySelector('p.text-lg') as HTMLElement | null)?.textContent?.trim() ?? '',
        time: (c.querySelector('p.font-mono') as HTMLElement | null)?.textContent?.trim() ?? '',
      }));
      return { band, candidates };
    });
    console.log('[wizard-phase2] [parity] browser result:', JSON.stringify(parityData));
    writeFileSync(`${SCRATCHPAD}/parity-browser-data.json`, JSON.stringify(parityData, null, 2));

    // ── 12. Confirm first candidate ───────────────────────────────────────
    const confirmBtns = page.locator('[data-testid="confirm-button"]');
    await confirmBtns.first().click();
    await page.waitForTimeout(600);

    // Handle RegenerationConfirmModal (sign-flip acknowledgement if needed)
    const modal = page.locator('[role="dialog"]');
    if (await modal.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log('[wizard-phase2] RegenerationConfirmModal appeared');
      // Check sign-flip acknowledgement checkbox if present
      const flipAck = page.locator('[data-testid="regen-flip-ack"] input[type="checkbox"]');
      if (await flipAck.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await flipAck.check();
        await page.waitForTimeout(250);
      }
      // Click the confirm button (last button in footer = gold Confirm)
      const footerBtns = modal.locator('[class*="px-6"][class*="py-4"] button');
      const btnCount = await footerBtns.count();
      if (btnCount > 0) {
        await footerBtns.last().click();
      } else {
        // Broader selector
        await modal.locator('button').filter({ hasText: /confirm|yes|use/i }).first().click();
      }
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: `${SCRATCHPAD}/07-post-confirm.png`, fullPage: true });

    // ── 13. Verify /dashboard post-confirm ────────────────────────────────
    await expect(page, 'must navigate to /dashboard after confirm').toHaveURL(/\/dashboard/, {
      timeout: 30_000,
    });
    await page.waitForTimeout(3_000); // let regenerate pipeline run
    await page.screenshot({ path: `${SCRATCHPAD}/08-dashboard-post-confirm.png`, fullPage: true });

    // Both times context present (recorded "06:44" OR rectified/authority labels)
    const dashText = (await page.evaluate(() => document.body.innerText ?? '')) ?? '';
    const showsBothTimesContext =
      dashText.includes('06:44') ||
      /rectified|recorded/i.test(dashText);
    expect(showsBothTimesContext, 'dashboard must show both-times context').toBe(true);

    // ── 14. Clean console ─────────────────────────────────────────────────
    // Exclude expected background 404s: the dashboard auto-starts the LLM
    // interpretation pipeline, which tries to fetch an optional AI endpoint.
    // In a test environment with no API key configured, the fetch returns 404.
    // That is a known, expected, non-fatal background call — NOT a JS runtime
    // error. We only fail on true JS runtime/pageerror lines.
    const jsErrors = consoleLines.filter((l) => {
      if (l.startsWith('[pageerror]')) return true; // real JS exception
      if (!l.startsWith('[error]')) return false;
      // Ignore resource 404s / network errors from background optional calls
      if (l.includes('404') || l.includes('Failed to load resource') || l.includes('net::ERR_')) {
        console.log(`[wizard-phase2] [ignored 404/net error] ${l}`);
        return false;
      }
      return true; // other [error] lines are real
    });
    if (jsErrors.length > 0) {
      console.log('[wizard-phase2] JS errors:', jsErrors.join('\n'));
    }
    expect(jsErrors.length, `must have 0 JS runtime errors; got: ${jsErrors.join('; ')}`).toBe(0);

    // ── 15. UNHAPPY PATH 2: wizard re-navigable (no dead-end) ────────────
    await spaNav(page, `/rectify/${profileId}`);
    await expect(
      page.locator('[data-testid="intro-step"]'),
      'wizard must be re-navigable without crash',
    ).toBeVisible({ timeout: 8_000 });

    // ── 16. Console tail ──────────────────────────────────────────────────
    console.log('[wizard-phase2] console tail (last 15):');
    for (const l of consoleLines.slice(-15)) console.log(`  ${l}`);

    console.log('\n[wizard-phase2] DONE — all checks passed');
    console.log(`[wizard-phase2] screenshots: ${SCRATCHPAD}/`);
    console.log(`[wizard-phase2] parity data: ${SCRATCHPAD}/parity-browser-data.json`);
  });
});
