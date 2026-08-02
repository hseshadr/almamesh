import { test, expect, type Page, type Download } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SiderealChart } from '@almamesh/browser/types';
import type { DivisionalChartId, VargaCtxFull } from '@almamesh/shared-types';
import { FOUNDER_DASHAS } from '../src/test/dashaFixtures';
import {
  DOMAINS_CTX,
  STRENGTH_CTX,
  TRANSIT_CTX,
  VARGA_CTX_FULL,
} from '../src/test/predictiveFixtures';
import {
  a4ContentBoundViolations,
  footerGeometryViolations,
  horizontalWordOverlapViolations,
  inspectPdfWithPoppler,
  normalizePdfText,
} from '../src/components/report-pdf/__tests__/pdfPoppler';

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
 *   3. hard-reloads the dashboard offline and proves the saved Cancer chart survives,
 *   4. computes fixed-date predictive transits and checks houses from Cancer,
 *   5. downloads the keyless report and verifies the same transit/lagna/date facts,
 *      including that section VII (Interpretation) is PRESENT with an honest
 *      "no reading yet" note rather than silently deleted, and that the document
 *      never shrinks below its measured 26-page baseline.
 *
 * A fourth test covers the stale-status regression: a complete natal-only
 * reading beside a `ready` predictive slice (the combination that downgrades the
 * reading's status to 'idle') must still print its narrative in the PDF.
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
const MAXIMAL_DOWNLOAD_PATH = resolve(OUT_DIR, 'e2e-maximal-download.pdf');
const STALE_DOWNLOAD_PATH = resolve(OUT_DIR, 'e2e-stale-natal-download.pdf');
const EN_REPORT_CATALOG = resolve(HERE, '../src/locales/en/report.json');

const SYNTHETIC_PROFILE_ID = 'report-pdf-maximal-profile';
const SYNTHETIC_CHART_ID = 'report-pdf-maximal-chart';
const SYNTHETIC_EVENT_COUNT = 18;
const CURRENT_SKY_SENTINEL = 'Current sky browser-download sentinel';
const TRANSIT_REFERENCE_TIME = '2026-07-11T12:00:00Z';

/**
 * The reported bug, in one sentence: a natal-only reading records
 * `inputProvenance.predictiveRequestKey: null`, and that provenance stops being
 * "input-current" the instant the predictive layer publishes raw contexts — so
 * an export gated on `status === 'complete'` silently dropped the entire
 * Interpretation section while the dashboard kept showing the same reading.
 * These sentinels are the narrative that MUST survive that downgrade.
 */
const NATAL_ONLY_SUMMARY_SENTINEL = 'Natal-only summary survives the stale-status downgrade';
const NATAL_ONLY_STRENGTH_SENTINEL = 'Natal-only strength survives the stale-status downgrade';

/**
 * Pages in the keyless report measured on `main` BEFORE the fix: sections I–VI
 * and VIII–XIII, with VII absent and the numbering visibly jumping VI → VIII.
 * The fixed document only ADDS the Interpretation page, so it can never be
 * shorter; a smaller count means a section was silently gutted again.
 */
const KEYLESS_PDF_BASELINE_PAGES = 26;

/**
 * The RAW engine predictive slices exactly as `computePredictive` returns them
 * (the store persists them at v2 under `rawContexts`). Their PRESENCE is what
 * makes the staleness path fire: `currentPredictiveFacts` counts predictive
 * facts as existing only when all four slices are readable, and a natal-only
 * reading is "current" only while they do NOT. Without `rawContexts` the bug
 * does not reproduce at all — the reading simply stays complete.
 */
const RAW_PREDICTIVE_CONTEXTS = {
  transit_context: { instant: TRANSIT_REFERENCE_TIME },
  varga_context_full: { charts: {} },
  strength_context: { ashtakavarga: { sarva: { total: 337 } } },
  domains_context: { forecasts: {} },
} as const;
const RECTIFIED_TRANSIT_ROWS = [
  { graha: 'Saturn', sign: 'Pisces', cancerHouse: 9, aquariusHouse: 2 },
  { graha: 'Sun', sign: 'Gemini', cancerHouse: 12, aquariusHouse: 5 },
  { graha: 'Rahu', sign: 'Aquarius', cancerHouse: 8, aquariusHouse: 1 },
] as const;
const ALL_VARGA_IDS = [
  'D1',
  'D2',
  'D3',
  'D4',
  'D7',
  'D9',
  'D10',
  'D12',
  'D16',
  'D20',
  'D24',
  'D27',
  'D30',
  'D40',
  'D45',
  'D60',
] as const satisfies readonly DivisionalChartId[];

test('report-PDF acceptance permanently disables hooks and stale-server reuse', async () => {
  const config = await readFile(resolve(HERE, '../playwright.report-pdf.config.ts'), 'utf8');
  expect(config).toMatch(
    /command:\s*`VITE_API_URL=\s+VITE_EXIT_GATE_HOOKS=\s+bun run build/,
  );
  expect(config).toMatch(
    /&&\s+VITE_API_URL=\s+VITE_EXIT_GATE_HOOKS=\s+bun run preview/,
  );
  expect(config).toContain('reuseExistingServer: false');
});

const SYNTHETIC_BIRTH = {
  name: 'Maximal Browser Native',
  birth_datetime_utc: '1990-01-15T12:00:00Z',
  birth_datetime_local: '1990-01-15T17:30:00',
  birth_location_details: {
    city: 'Delhi',
    state: 'Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    timezone: 'Asia/Kolkata',
    location_name: 'Delhi, India',
  },
} as const;

const BASE_SYNTHETIC_PLANET = {
  longitude: 75.1,
  latitude: 0,
  distance: 9.5,
  speed: 0.03,
  is_retrograde: false,
  sign: 'Gemini',
  sign_degrees: 15.1,
  sign_lord: 'mercury',
  nakshatra: 'Ardra',
  nakshatra_pada: 3,
  nakshatra_lord: 'rahu',
  house: 3,
  dignity: 'neutral',
  is_combust: false,
  combustion_separation_deg: null,
  houses_ruled: [10, 11],
  is_yogakaraka: false,
} as const;

function syntheticPlanet(name: string, index: number, nakshatra: string) {
  return {
    ...BASE_SYNTHETIC_PLANET,
    name,
    longitude: index * 30 + 29.99,
    sign_degrees: 29.99,
    nakshatra,
    house: index + 1,
  };
}

const SYNTHETIC_PLANETS: SiderealChart['planets'] = {
  sun: syntheticPlanet('sun', 0, 'Ashwini'),
  moon: syntheticPlanet('moon', 1, 'Bharani'),
  mars: syntheticPlanet('mars', 2, 'Krittika'),
  mercury: syntheticPlanet('mercury', 3, 'Rohini'),
  jupiter: syntheticPlanet('jupiter', 4, 'Mrigashira'),
  venus: syntheticPlanet('venus', 5, 'Ardra'),
  saturn: syntheticPlanet('saturn', 6, 'Punarvasu'),
  rahu: syntheticPlanet('rahu', 7, 'Uttara Bhadrapada'),
  ketu: syntheticPlanet('ketu', 8, 'Final Planet Sentinel'),
};

function syntheticYoga(index: number) {
  const final = index === 8;
  const name = final ? 'Final Yoga Sentinel' : `Synthetic Yoga ${index + 1}`;
  return {
    name,
    display_name: name,
    category: 'special',
    description: final
      ? 'The final yoga card survives browser PDF pagination.'
      : `Synthetic yoga card ${index + 1} exercises pagination.`,
    effects: 'Display-only synthetic evidence.',
    grade: index % 2 === 0 ? ('strong' as const) : ('moderate' as const),
    strength_factors: [
      {
        planet: 'saturn',
        factor: 'synthetic',
        value: 'present',
        basis: 'browser PDF acceptance fixture',
        mark: 1,
      },
    ],
    planets_involved: ['saturn'],
    houses_involved: [10],
    planetary_signature: 'Saturn',
    formation_rules: [
      {
        rule: 'synthetic_rule',
        description: 'Synthetic formation for artifact testing.',
        source: 'E2E fixture',
        planets: ['saturn'],
        houses: [10],
      },
    ],
  };
}

const SYNTHETIC_SIDEREAL: SiderealChart = {
  ayanamsa_value: 24.1,
  lagna: {
    longitude: 5.4,
    sign: 'Aries',
    sign_degrees: 5.4,
    sign_lord: 'mars',
    nakshatra: 'Ashwini',
    nakshatra_pada: 2,
    nakshatra_lord: 'ketu',
  },
  planets: SYNTHETIC_PLANETS,
  houses: Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      String(index + 1),
      { house: index + 1, longitude: index * 30, sign: 'Aries', sign_lord: 'mars' },
    ]),
  ) as SiderealChart['houses'],
  dashas: FOUNDER_DASHAS,
  yogas: Array.from({ length: 9 }, (_, index) => syntheticYoga(index)),
  navamsa: {
    name: 'D9',
    lagna_sign: 'Leo',
    lagna_sign_lord: 'sun',
    planets: { saturn: { name: 'saturn', sign: 'Aquarius', sign_lord: 'saturn' } },
  },
};

const SYNTHETIC_VARGA_CONTEXT: VargaCtxFull = {
  ...VARGA_CTX_FULL,
  charts: Object.fromEntries(
    ALL_VARGA_IDS.map((id) => [
      id,
      {
        ...VARGA_CTX_FULL.charts.D1,
        chart: id,
      },
    ]),
  ) as VargaCtxFull['charts'],
};

/**
 * The stored reading seeded beside the synthetic chart.
 *
 * `staleNatalOnly` reproduces the reported production case: the reading is
 * natal-only, so its provenance key is `null`, which the interpretation store
 * treats as current ONLY while no predictive facts exist. Seeded next to a
 * `ready` predictive slice carrying `rawContexts`, the reading's status is
 * downgraded to 'idle' — exactly the condition the export used to gate on.
 * Otherwise the reading is keyed to the current predictive request and stays
 * complete on every code path.
 */
function syntheticInterpretationEntry(requestKey: string, staleNatalOnly: boolean) {
  const base = {
    status: 'complete',
    profileId: SYNTHETIC_PROFILE_ID,
    updatedAt: '2026-07-11T12:00:00Z',
  } as const;
  if (staleNatalOnly) {
    return {
      ...base,
      sections: { summary: true, strengths: true },
      inputProvenance: { predictiveRequestKey: null },
      interpretation: {
        summary: {
          layman: `${NATAL_ONLY_SUMMARY_SENTINEL}.`,
          technical: `${NATAL_ONLY_SUMMARY_SENTINEL}.`,
        },
        strengths: [
          {
            title: 'Saturn in the tenth',
            layman: NATAL_ONLY_STRENGTH_SENTINEL,
            technical: NATAL_ONLY_STRENGTH_SENTINEL,
          },
        ],
        challenges: [],
        life_themes: [],
        // No `current_sky`: a natal-only reading never narrates timing.
      },
    };
  }
  return {
    ...base,
    sections: { current_sky: true },
    inputProvenance: { predictiveRequestKey: requestKey },
    interpretation: {
      summary: {
        layman: 'A synthetic maximal-report reading.',
        technical: 'A synthetic maximal-report reading.',
      },
      strengths: [],
      challenges: [],
      life_themes: [],
      current_sky: [
        {
          title: 'Jupiter transit',
          layman: CURRENT_SKY_SENTINEL,
          technical: CURRENT_SKY_SENTINEL,
        },
      ],
    },
  };
}

interface MaximalSeedOptions {
  /**
   * Seed the PRODUCTION staleness case instead of the all-current one: a
   * natal-only reading (`predictiveRequestKey: null`) beside a `ready`
   * predictive slice that carries `rawContexts`. See
   * `syntheticInterpretationEntry` and `RAW_PREDICTIVE_CONTEXTS`.
   */
  readonly staleNatalOnlyReading?: boolean;
}

/** Seed only local persisted inputs; the page still builds and downloads the real report. */
async function seedSyntheticMaximalReport(
  page: Page,
  options: MaximalSeedOptions = {},
): Promise<void> {
  const staleNatalOnly = options.staleNatalOnlyReading === true;
  // Establish the preview origin without booting the SPA. If the empty Zustand
  // stores hydrate before this write, they can race and overwrite the fixture.
  await page.goto('/robots.txt', { waitUntil: 'domcontentloaded' });
  const referenceInstant = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const requestKey = JSON.stringify([
    SYNTHETIC_PROFILE_ID,
    SYNTHETIC_BIRTH.birth_datetime_utc,
    SYNTHETIC_BIRTH.birth_location_details.latitude,
    SYNTHETIC_BIRTH.birth_location_details.longitude,
    referenceInstant,
  ]);
  const storedChart = {
    chart_id: SYNTHETIC_CHART_ID,
    profile_id: SYNTHETIC_PROFILE_ID,
    person_name: SYNTHETIC_BIRTH.name,
    is_primary: true,
    birth_data: SYNTHETIC_BIRTH,
    astronomical_calculations: {
      sidereal_ctx: {
        ayanamsa_value: SYNTHETIC_SIDEREAL.ayanamsa_value,
        ayanamsa_type: 'lahiri',
        house_system: 'whole_sign',
        julian_day: 0,
        sidereal_time: 0,
        lagna: SYNTHETIC_SIDEREAL.lagna,
        planets: SYNTHETIC_SIDEREAL.planets,
      },
      calculation_timestamp: '2026-01-01T00:00:00Z',
      software_version: 'report-pdf-e2e',
    },
    sidereal_chart: SYNTHETIC_SIDEREAL,
  };
  const events = Array.from({ length: SYNTHETIC_EVENT_COUNT }, (_, index) => {
    const final = index === SYNTHETIC_EVENT_COUNT - 1;
    return {
      id: `report-pdf-maximal-event-${index + 1}`,
      description: final ? 'family_rupture' : 'career_change',
      summary: final
        ? 'Final paginated event sentinel'
        : index === 0
          ? 'Accepted the maximal browser sentinel role'
          : `Synthetic supporting event ${index + 1}`,
      date: `${2000 + index}-07-01`,
      category: final ? 'family_rupture' : 'career_change',
      precision: 'exact',
      createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    };
  });
  const supportingEvents = events.map((event, index) => ({
    eventIndex: index,
    category: event.category,
    date: event.date,
    signals:
      index === events.length - 1
        ? ['pd_lord_rules_h7#dignified_fit']
        : ['md_lord_rules_h10'],
    contribution: 1,
  }));
  const record = {
    profileId: SYNTHETIC_PROFILE_ID,
    confirmedAt: '2026-01-01T00:00:00Z',
    mode: 'cusp',
    band: 'leans',
    margin: 0.72,
    originalTime: '17:15',
    originalSign: 'pisces',
    rectifiedTime: '17:30',
    rectifiedSign: 'aries',
    supportingEventIds: events.map((event) => event.id),
    resultSnapshot: {
      mode: 'cusp',
      margin: 0.72,
      band: 'leans',
      discriminatingEventCount: events.length,
      confidencePct: 72,
      recordedTimeSign: 'pisces',
      honestyNoteKey: 'rectify.honesty.leans',
      candidates: [
        {
          ascendantSign: 'aries',
          representativeTimeLocal: '17:30',
          lagnaLongitudeDeg: 5.4,
          lagnaCuspDistanceDeg: 5.4,
          isNearCusp: false,
          fitScore: 18.2,
          navamsaLagnaSign: 'leo',
          positiveTotal: 18,
          penaltyTotal: 0.15,
          priorBonus: 0.35,
          misses: ['miss_silent_family_rupture_h4'],
          supportingEvents,
        },
        {
          ascendantSign: 'pisces',
          representativeTimeLocal: '08:15',
          lagnaLongitudeDeg: 359.2,
          lagnaCuspDistanceDeg: 0.8,
          isNearCusp: true,
          fitScore: 7.4,
          navamsaLagnaSign: 'cancer',
          positiveTotal: 7.4,
          penaltyTotal: 0,
          priorBonus: 0,
          misses: [],
          supportingEvents: [],
        },
      ],
    },
  };
  const entries: ReadonlyArray<readonly [string, string]> = [
    [
      'almamesh-profiles',
      JSON.stringify({
        state: {
          profiles: {
            [SYNTHETIC_PROFILE_ID]: {
              id: SYNTHETIC_PROFILE_ID,
              name: SYNTHETIC_BIRTH.name,
              createdAt: '2026-01-01T00:00:00Z',
              avatarTint: '#C9A24B',
            },
          },
          activeProfileId: SYNTHETIC_PROFILE_ID,
        },
        version: 1,
      }),
    ],
    [
      'almamesh-chart-library',
      JSON.stringify({ state: { charts: { [SYNTHETIC_CHART_ID]: storedChart } }, version: 1 }),
    ],
    [
      'almamesh-predictive',
      JSON.stringify({
        state: {
          status: 'ready',
          transitCtx: TRANSIT_CTX,
          vargaCtxFull: SYNTHETIC_VARGA_CONTEXT,
          strengthCtx: STRENGTH_CTX,
          domainsCtx: DOMAINS_CTX,
          // Only the stale case publishes raw engine facts — that is the
          // trigger that turns a natal-only reading's provenance stale.
          ...(staleNatalOnly ? { rawContexts: RAW_PREDICTIVE_CONTEXTS } : {}),
          profileKey: SYNTHETIC_PROFILE_ID,
          requestKey,
        },
        version: 2,
      }),
    ],
    [
      'almamesh-life-events',
      JSON.stringify({
        state: { eventsByProfile: { [SYNTHETIC_PROFILE_ID]: events } },
        version: 4,
      }),
    ],
    [
      'almamesh-interpretations',
      JSON.stringify({
        state: {
          byChart: {
            [SYNTHETIC_CHART_ID]: syntheticInterpretationEntry(requestKey, staleNatalOnly),
          },
        },
        version: 5,
      }),
    ],
    [
      'almamesh-rectification-records',
      JSON.stringify({
        state: { recordsByProfile: { [SYNTHETIC_PROFILE_ID]: record } },
        version: 2,
      }),
    ],
  ];

  await page.evaluate(async (persistedEntries) => {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const open = indexedDB.open('keyval-store');
      open.onupgradeneeded = () => open.result.createObjectStore('keyval');
      open.onerror = () => rejectPromise(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction('keyval', 'readwrite');
        for (const [key, value] of persistedEntries) {
          transaction.objectStore('keyval').put(value, key);
        }
        transaction.oncomplete = () => resolvePromise();
        transaction.onerror = () => rejectPromise(transaction.error);
      };
    });
    localStorage.setItem('almamesh-chart', '1');
  }, entries);
}

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

  const hookGlobals = await page.evaluate(() => {
    const gateWindow = window as typeof window & {
      readonly __almameshGenerate?: unknown;
      readonly __ALMAMESH_STAGE__?: unknown;
    };
    return {
      generate: typeof gateWindow.__almameshGenerate,
      stage: typeof gateWindow.__ALMAMESH_STAGE__,
    };
  });
  expect(hookGlobals, 'the real-visitor acceptance build must not expose exit-gate hooks').toEqual({
    generate: 'undefined',
    stage: 'undefined',
  });

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

  // Step 5 — turn a real free-form narrative into two typed rows with the
  // deterministic, zero-egress fallback. This is the exact first-run path used
  // when no AI provider has been configured.
  await page
    .getByTestId('life-events-input')
    .fill('I got married in 2015. I changed careers in 2020.');
  await page.getByTestId('extract-events-button').click();
  const capturedEvents = page.getByTestId('captured-life-events');
  await expect(capturedEvents.getByText(/got married in 2015/i)).toBeVisible({ timeout: 10_000 });
  await expect(capturedEvents.getByText(/changed careers in 2020/i)).toBeVisible();

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

async function expectReportTransitRow(
  page: Page,
  expected: (typeof RECTIFIED_TRANSIT_ROWS)[number],
): Promise<void> {
  const table = page.getByTestId('report-gochara-table');
  const row = table.getByRole('row').filter({
    has: page.getByRole('cell', { name: expected.graha, exact: true }),
  });
  await expect(row).toHaveCount(1);
  const cells = row.getByRole('cell');
  await expect(cells.nth(1)).toHaveText(expected.sign);
  await expect(cells.nth(4)).toHaveText(String(expected.cancerHouse));
  await expect(cells.nth(4)).not.toHaveText(String(expected.aquariusHouse));
}

/**
 * The shipping ENGLISH copy for one dotted key of the `report` namespace.
 *
 * Read from the catalog rather than retyped: an assertion that hardcodes prose
 * passes while the app says something completely different, and it goes red on
 * a harmless copy edit. The catalog is what the PDF actually renders.
 */
async function englishReportString(dottedKey: string): Promise<string> {
  const catalog: unknown = JSON.parse(await readFile(EN_REPORT_CATALOG, 'utf8'));
  let node: unknown = catalog;
  for (const segment of dottedKey.split('.')) {
    node = node === null || typeof node !== 'object'
      ? undefined
      : (node as Record<string, unknown>)[segment];
  }
  expect(typeof node, `en/report.json must define "${dottedKey}"`).toBe('string');
  return String(node);
}

/** Whitespace-flattened, case-folded PDF text — headings letter-space and body copy wraps. */
function flattenPdfText(pdfText: string): string {
  return normalizePdfText(pdfText).toLocaleLowerCase('en');
}

/**
 * The flattened "<eyebrow> <title>" needle for the Interpretation section — the
 * two parts ADJACENT, which is how `ReportPdfHeading` renders them.
 *
 * Checking the eyebrow alone would be VACUOUS: "section vii" is a substring of
 * the "SECTION VIII" eyebrow that follows it, so a bare eyebrow check passes on
 * the pre-fix 26-page document that deleted section VII outright (verified
 * against the saved pre-fix artifact). The pair is present only when the
 * section itself is.
 */
async function interpretationHeadingNeedle(): Promise<string> {
  const eyebrow = await englishReportString('pdf.narrative_eyebrow');
  const title = await englishReportString('interpretation.heading');
  return flattenPdfText(`${eyebrow} ${title}`);
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

function pdfTransitColumns(pdfText: string, graha: string): readonly string[] {
  const normalized = pdfText.toLocaleLowerCase('en');
  const start = normalized.indexOf('transits & timing');
  expect(start).toBeGreaterThanOrEqual(0);

  const line = pdfText
    .slice(start)
    .split('\n')
    .find((candidate) => new RegExp(`^\\s*${graha}\\s+`, 'i').test(candidate));
  expect(line, `${graha} must appear in the PDF gochara table`).toBeDefined();
  const columns = line?.trim().split(/\s{2,}/) ?? [];
  expect(columns).toHaveLength(6);
  return columns;
}

// The running maha/antar/pratyantar row carries an extra trailing word — the
// `labels.dashaCurrentMarker` text (ReportPdfDasha.tsx) — in the SAME y-band as
// the rest of the row, so it lands in the same extracted line. The marker is
// OPTIONAL in the pattern (most rows don't have it) and its exact text is
// threaded in from the shipping catalog rather than hardcoded, so a copy edit
// to "Current" can't silently desync this from what the PDF actually prints.
function dashaRowPattern(currentMarker: string): RegExp {
  const escapedMarker = currentMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^(Sun|Moon|Mars|Rahu|Jupiter|Saturn|Mercury|Ketu|Venus)\\s+([A-Z][a-z]{2} \\d{4})\\s+—\\s+([A-Z][a-z]{2} \\d{4})\\s+\\d+(?:\\.\\d+)? yr(?:\\s+${escapedMarker})?$`,
  );
}

function titleCaseDashaLord(lord: string): string {
  return `${lord.charAt(0).toUpperCase()}${lord.slice(1)}`;
}

function dashaMonthYear(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

function dashaRowTuple(period: {
  readonly lord: string;
  readonly start_date: string;
  readonly end_date: string;
}): string {
  return [
    titleCaseDashaLord(period.lord),
    dashaMonthYear(period.start_date),
    dashaMonthYear(period.end_date),
  ].join('|');
}

function downloadedDashaRowTuples(
  pdf: Awaited<ReturnType<typeof inspectPdfWithPoppler>>,
  currentMarker: string,
): readonly string[] {
  const pattern = dashaRowPattern(currentMarker);
  return pdf.pages
    .filter(
      (pdfPage) =>
        pdfPage.text.includes('MAHA-DASA SEQUENCE') || /\bANTAR-DASAS\b/i.test(pdfPage.text),
    )
    .flatMap((pdfPage) => {
      const bands: Array<{
        center: number;
        words: Array<(typeof pdfPage.words)[number]>;
      }> = [];
      for (const word of [...pdfPage.words].sort((left, right) => left.yMin - right.yMin)) {
        const center = (word.yMin + word.yMax) / 2;
        const band = bands.find((candidate) => Math.abs(candidate.center - center) <= 1.5);
        if (band) band.words.push(word);
        else bands.push({ center, words: [word] });
      }
      return bands.map((band) =>
        band.words
          .sort((left, right) => left.xMin - right.xMin)
          .map((word) => word.text)
          .join(' '),
      );
    })
    .flatMap((line) => {
      const match = pattern.exec(line);
      return match ? [`${match[1]}|${match[2]}|${match[3]}`] : [];
    });
}

test('REAL onboarding -> rectify -> offline reload -> predictive PDF is correct', async ({ page }) => {
  test.setTimeout(480_000);
  const { errors } = collectConsole(page);
  await mkdir(OUT_DIR, { recursive: true });

  // The PDF layout engine (yoga, inside @react-pdf) must load its wasm from an
  // own-origin hashed asset (yogaWasmAssetPlugin) — never by fetch()ing a
  // data: URI, which production CSP blocks. Collect the evidence here; the
  // assertion runs after the PDF download below.
  const wasmAssetUrls: string[] = [];
  page.on('response', (response) => {
    if (/\/assets\/[^/]+\.wasm(\?|$)/.test(response.url()) && response.ok()) {
      wasmAssetUrls.push(response.url());
    }
  });

  // ---- 0. Production-fidelity guard: the preview server must serve the REAL
  // Cloudflare CSP (previewProdCspPlugin in vite.config.ts). Without it this
  // suite cannot catch CSP-blocked fetches — the yoga-layout data:-URI wasm
  // fetch shipped console errors to production exactly that way while the
  // clean-console gate below stayed vacuously green.
  const bootResponse = await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  expect(
    bootResponse?.headers()['content-security-policy'] ?? '',
    'vite preview must serve the production Content-Security-Policy (previewProdCspPlugin)',
  ).toContain("connect-src 'self'");

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

  // Deliberately let the Dashboard's heavy predictive computation start on the
  // same serial Pyodide worker. This reproduces the slow-run scheduling case
  // that previously let Save race ahead of the queued lagna previews.
  await expect(page.getByTestId('life-atlas-gate')).toContainText('Computing on this device', {
    timeout: 15_000,
  });

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

  // The product deliberately keeps Save disabled until BOTH engine previews
  // resolve, so the sign-flip acknowledgement can never be bypassed by a slow
  // worker. Prove the user-visible comparison before opening the modal.
  const comparison = page.getByTestId('birth-time-comparison');
  await expect(comparison).toContainText('06:14', { timeout: 180_000 });
  await expect(comparison).toContainText('06:44');
  await expect(comparison).toContainText('As recorded');
  await expect(comparison).toContainText('Rectified');
  await expect(comparison).toContainText('Leo');
  await expect(comparison).toContainText('Cancer');

  // Save Changes -> the regeneration modal. Because 06:44 -> 06:14 crosses the
  // Leo/Cancer sign boundary, the modal raises its MANDATORY rising-sign-flip
  // acknowledgement: "Confirm & Regenerate" stays DISABLED until the user ticks
  // the "regen-flip-ack" checkbox. This is the real-visitor gate — a sign flip is
  // a different chart, not a tweak — so the gate must drive it exactly as a person
  // must. The checkbox is engine-gated (it appears only once BOTH lagna previews
  // resolve on the shared Pyodide thread and disagree), so wait for it before
  // ticking; that same wait removes the pre-fix race where the click could land
  // on the button in its brief still-enabled window before the flip was detected.
  const saveChanges = page.getByRole('button', { name: 'Save Changes' });
  await expect(saveChanges).toBeEnabled({ timeout: 180_000 });
  await saveChanges.click();
  const flipAck = page.getByTestId('regen-flip-ack').locator('input[type="checkbox"]');
  await flipAck.waitFor({ state: 'visible', timeout: 60_000 });
  await flipAck.check();
  const confirmRegenerate = page.getByRole('button', { name: 'Confirm & Regenerate' });
  await expect(confirmRegenerate, 'the sign-flip ack must enable Confirm & Regenerate').toBeEnabled({
    timeout: 15_000,
  });
  await confirmRegenerate.click();
  // The on-device regenerate then shows a success card with a "View New Chart" CTA.
  const viewNewChart = page.getByRole('button', { name: /View New Chart/i });
  await expect(viewNewChart, 'rectification must regenerate the chart on-device').toBeVisible({
    timeout: 90_000,
  });
  await viewNewChart.click();

  // Back on the dashboard, wait for the regenerated Cancer chart to be COMMITTED
  // and live before asserting the lagna. "Confirm & Regenerate" is fire-and-forget:
  // it shows the success card (and thus "View New Chart") the instant the
  // birth-info-changed event is emitted, NOT when the recompute finishes. The
  // real on-device regenerate then has to run engine.generateChart on the SINGLE
  // serial Pyodide worker, saveChart the new chart id, invalidate the
  // ['primary-chart'] query, refetch, and re-render — and that recompute can be
  // queued behind the dashboard's ~30s predictive auto-compute on the same worker.
  // Polling the lagna text alone races that commit: the stale Leo snapshot reads
  // for the whole window, which is the CI flake ("Received: leo0°02′ …"). Gate on
  // the commit-tied `identity-rectification` note instead — it is ABSENT on the
  // entered-time Leo chart and renders ONLY once the new rectified (06:14) chart
  // is the live primary chart, and the SAME render flips the lagna to Cancer. So
  // it is the deterministic "the new chart is on screen" signal. Allow
  // serial-worker headroom (mirrors the 180s Save-gate waits above); the lagna
  // poll then resolves immediately once the note is present.
  await waitForDashboardChart(page);
  await expect(
    page.getByTestId('identity-rectification'),
    'the regenerated rectified (06:14) chart must become the live dashboard chart',
  ).toContainText('6:14 AM', { timeout: 180_000 });
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

  // ---- 4. HARD-OFFLINE RELOAD: SW shell + saved rectified chart ----
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return (
            registration?.active?.state === 'activated' &&
            navigator.serviceWorker.controller !== null
          );
        }),
      {
        timeout: 30_000,
        message: 'the dashboard must be controlled by an activated service worker',
      },
    )
    .toBe(true);

  const offlineConsoleStart = errors.length;
  try {
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });

    expect(new URL(page.url()).pathname).toBe('/dashboard');
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller !== null),
      'the offline document must be served under service-worker control',
    ).toBe(true);
    await expect(page.locator('#root')).toBeAttached();
    await waitForDashboardChart(page);

    const offlineLagna = await readDashboardLagna(page);
    expect(offlineLagna, 'the saved rectified chart must survive a hard-offline reload').toContain(
      'cancer',
    );
    expect(offlineLagna, 'offline reload must not revert to the entered-time Leo chart').not.toContain(
      'leo',
    );
    const rectificationNote = page.getByTestId('identity-rectification');
    await expect(rectificationNote).toContainText('6:44 AM');
    await expect(rectificationNote).toContainText('6:14 AM');
  } finally {
    await page.context().setOffline(false);
  }

  const offlineErrors = errors.splice(offlineConsoleStart);
  const unexpectedOfflineErrors = offlineErrors.filter(
    (message) =>
      !/^\[console\.error\] Failed to load resource: net::ERR_INTERNET_DISCONNECTED$/.test(
        message,
      ),
  );
  expect(
    unexpectedOfflineErrors,
    `unexpected console errors during hard-offline reload:\n${unexpectedOfflineErrors.join('\n')}`,
  ).toEqual([]);

  // ---- 5. Fixed-date predictive computation from the persisted Cancer lagna ----
  const realNow = new Date();
  const generatedOn = new Date(TRANSIT_REFERENCE_TIME);
  await page.clock.setFixedTime(generatedOn);
  await spaNavigate(page, '/report');
  const computePredictive = page.getByTestId('report-predictive-compute');
  await expect(computePredictive).toBeVisible({ timeout: 60_000 });
  await computePredictive.click();
  const gocharaTable = page.getByTestId('report-gochara-table');
  await expect(gocharaTable).toBeVisible({ timeout: 150_000 });
  await expect(gocharaTable.getByRole('columnheader').nth(4)).toHaveText('From Lagna');
  for (const expected of RECTIFIED_TRANSIT_ROWS) {
    await expectReportTransitRow(page, expected);
  }

  // ---- 6. /report -> Download PDF (deterministic, no LLM key) ----
  const downloadBtn = page.getByTestId('report-download-pdf');
  await expect(downloadBtn).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('report-document')).toBeVisible({ timeout: 30_000 });

  // Stage-4 stable-vs-lagna: the assumptions & provenance panel ALWAYS renders
  // (ayanāṁśa, whole-sign, entered-vs-rectified, cusp proximity), and every yoga
  // carries an honest birth-time stability chip (a word, never a number).
  await expect(page.getByTestId('report-assumptions')).toBeVisible({ timeout: 30_000 });
  expect(
    (await page.getByTestId('report-assumptions-house-system').textContent())?.toLowerCase(),
    'the assumptions panel must name the whole-sign house system',
  ).toContain('whole-sign');
  await expect(
    page.getByTestId('report-stability-chip').first(),
    'each yoga must carry a birth-time stability chip',
  ).toBeVisible({ timeout: 30_000 });

  await page.screenshot({ path: REPORT_SHOT, fullPage: true });

  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    downloadBtn.click(),
  ]);
  await download.saveAs(DOWNLOAD_PATH);

  // ---- 7. Parse the PDF text and ASSERT correctness ----
  const pdfText = await pdfToText(DOWNLOAD_PATH);
  await writeFile(resolve(OUT_DIR, 'e2e-download.assertions.txt'), pdfText, 'utf8');

  for (const expected of RECTIFIED_TRANSIT_ROWS) {
    const columns = pdfTransitColumns(pdfText, expected.graha);
    expect(columns[1]).toBe(expected.sign);
    expect(columns[4]).toBe(String(expected.cancerHouse));
    expect(columns[4]).not.toBe(String(expected.aquariusHouse));
  }
  await page.clock.setFixedTime(realNow);

  // 7a. The "generated on" date matches the fixed reference day (the
  // `new Date(0)` bug
  // would print 1969/1970). The cover renders the locale-formatted date
  // ("July 11, 2026"); assert the exact long-form date is present and that
  // no Unix-epoch year leaks anywhere in the document.
  const generatedOnLong = generatedOn.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const dateLine = (
    pdfText.split('\n').find((line) => line.includes(generatedOnLong)) ?? ''
  ).trim();
  expect(
    pdfText,
    `the PDF must carry the reference generated-on date ("${generatedOnLong}")`,
  ).toContain(generatedOnLong);
  expect(pdfText, 'the PDF must NOT show the Unix-epoch year 1969').not.toMatch(/\b1969\b/);
  expect(pdfText, 'the PDF must NOT show the Unix-epoch year 1970').not.toMatch(/\b1970\b/);

  // 7b. Birth time shows the rectified 6:14 AM (not the original 6:44 AM). The
  // cover renders a 12-hour clock ("6:14 AM (Asia/Kolkata)").
  const timeOfBirthLine = (pdfText.split('\n').find((l) => /time of birth/i.test(l)) ?? '').trim();
  expect(timeOfBirthLine, 'the PDF must carry a "Time of Birth" line').toMatch(/time of birth/i);
  expect(timeOfBirthLine, 'the PDF birth-time must be the rectified 6:14 AM').toContain('6:14 AM');
  expect(timeOfBirthLine, 'the PDF birth-time must NOT be the original 6:44 AM').not.toContain('6:44');

  // 7c. Lagna / ascendant is Cancer (the rectified result), not Leo. SCOPE
  // to the "ASCENDANT (LAGNA)" birth-detail line — the PDF body may legitimately
  // name Leo elsewhere (planets occupy many signs regardless of the rising sign).
  const ascLine = pdfAscendantLine(pdfText).toLowerCase();
  expect(ascLine, 'the PDF must carry an "Ascendant (Lagna)" line').toMatch(/ascendant\s*\(lagna\)/i);
  expect(ascLine, 'the PDF ascendant must be Cancer (the rectified result)').toContain('cancer');
  expect(ascLine, 'the PDF ascendant must NOT be the original Leo').not.toContain('leo');

  // 7d. The natal sections are present (multi-page deterministic report).
  expect(pdfText, 'PDF must include the person name').toContain('Reference Native');
  expect(pdfText.toLowerCase(), 'PDF must include the birth place').toContain('bengaluru');
  // Multi-page: the report carries the deterministic natal sections. Assert a
  // few section headers are present (cover + planets + dasha + yogas).
  expect(pdfText.toLowerCase(), 'PDF must include the planetary-positions section').toContain('nakshatra');
  // The dasha section header renders as "Vimshottari Dasa" (engine spelling).
  expect(pdfText.toLowerCase(), 'PDF must include the Vimshottari dasa section').toMatch(/vimshottari|dasa/);
  expect(pdfText.toLowerCase(), 'PDF must include the yogas section').toContain('yoga');
  // 7e. The PDF mirrors the Stage-4 assumptions & provenance section.
  expect(pdfText.toLowerCase(), 'PDF must mirror the assumptions & provenance section').toContain(
    'provenance',
  );
  expect(pdfText.toLowerCase(), 'the PDF assumptions must name the whole-sign house system').toContain(
    'whole-sign',
  );

  // 7f. KEYLESS HONESTY. This lane never configures an LLM, so no reading
  // exists — and the pre-fix document simply DELETED section VII, leaving the
  // numbering to jump VI → VIII with nothing to explain it. The section must
  // now print its heading and say plainly that the written interpretation
  // appears once a reading is generated. Assert against the shipping catalog
  // copy, never hand-typed prose (see `englishReportString`). Headings
  // letter-space and the note wraps mid-sentence in the PDF, so compare on
  // whitespace-flattened, case-folded text.
  const flatPdfText = flattenPdfText(pdfText);
  const headingNeedle = await interpretationHeadingNeedle();
  const narrativeAbsentNote = await englishReportString('pdf.narrative_absent_note');
  expect(
    flatPdfText,
    `a keyless report must still carry the Interpretation section ("${headingNeedle}")`,
  ).toContain(headingNeedle);
  expect(
    flatPdfText,
    'a keyless report must SAY the interpretation is absent, never silently skip section VII',
  ).toContain(flattenPdfText(narrativeAbsentNote));

  // 7g. The document may only GROW. 26 pages is the measured pre-fix baseline
  // (sections I–VI, VIII–XIII); a shorter report means a section was gutted.
  const downloadedPages = (
    await inspectPdfWithPoppler(new Uint8Array(await readFile(DOWNLOAD_PATH)))
  ).pages.length;
  console.log('[report-pdf] keyless page count :', downloadedPages);
  expect(
    downloadedPages,
    `the keyless report must not shrink below its ${KEYLESS_PDF_BASELINE_PAGES}-page baseline`,
  ).toBeGreaterThanOrEqual(KEYLESS_PDF_BASELINE_PAGES);

  // Surface the load-bearing lines in the test log as evidence.
  console.log('[report-pdf] generated-on date :', JSON.stringify(dateLine || generatedOnLong));
  console.log('[report-pdf] time-of-birth line:', JSON.stringify(timeOfBirthLine));
  console.log('[report-pdf] ascendant line    :', JSON.stringify(pdfAscendantLine(pdfText)));

  // The PDF just generated, so yoga's wasm must have been served as an
  // own-origin hashed asset (see the response collector at the top): the
  // CSP-clean loading path actually executed, not a silent fallback.
  expect(
    wasmAssetUrls.length,
    'the PDF layout wasm must load from an own-origin /assets/*.wasm asset',
  ).toBeGreaterThan(0);
  console.log('[report-pdf] yoga wasm asset   :', wasmAssetUrls[0]);

  // Final clean-console gate across the whole journey.
  expect(errors, `console errors during the full journey:\n${errors.join('\n')}`).toEqual([]);
});

test('synthetic maximal state -> real browser download preserves every report family', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mkdir(OUT_DIR, { recursive: true });
  await seedSyntheticMaximalReport(page);
  await page.goto('/report?mode=astrologer', { waitUntil: 'domcontentloaded' });

  const downloadBtn = page.getByTestId('report-download-pdf');
  await expect(downloadBtn).toBeVisible({ timeout: 30_000 });

  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    downloadBtn.click(),
  ]);
  await download.saveAs(MAXIMAL_DOWNLOAD_PATH);

  const maximalBytes = new Uint8Array(await readFile(MAXIMAL_DOWNLOAD_PATH));
  const inspectedPdf = await inspectPdfWithPoppler(maximalBytes);
  const footerNote = 'AlmaMesh · Vedic Birth-Chart Report';
  expect(a4ContentBoundViolations(inspectedPdf, { footerNote })).toEqual([]);
  expect(footerGeometryViolations(inspectedPdf, { footerNote })).toEqual([]);
  expect(horizontalWordOverlapViolations(inspectedPdf, 'SADBALA')).toEqual([]);
  expect(horizontalWordOverlapViolations(inspectedPdf, 'ANTAR-DASAS')).toEqual([]);

  const expectedMahaRows = FOUNDER_DASHAS.maha_dasha_sequence.map(dashaRowTuple);
  const expectedAntarRows = FOUNDER_DASHAS.maha_dasha_sequence.flatMap((maha) =>
    (maha.antar_sequence ?? []).map(dashaRowTuple),
  );
  const expectedPratyantarRows = (FOUNDER_DASHAS.pratyantar_sequence ?? []).map(dashaRowTuple);
  const expectedDashaRows = [
    ...expectedMahaRows,
    ...expectedAntarRows,
    ...expectedPratyantarRows,
  ];
  // `styles.dashaCurrentMark` (theme.ts) sets `textTransform: 'uppercase'`, so
  // the glyphs pdftotext actually extracts are "CURRENT", not the catalog's
  // title-case "Current" — mirror that transform rather than hardcoding the
  // upper-cased word, so a font/style change can't silently desync this again.
  const dashaCurrentMarker = (
    await englishReportString('pdf.dasha_current_marker')
  ).toLocaleUpperCase('en');
  const downloadedDashaRows = downloadedDashaRowTuples(inspectedPdf, dashaCurrentMarker);
  expect(expectedMahaRows).toHaveLength(9);
  expect(expectedAntarRows).toHaveLength(81);
  expect(expectedPratyantarRows).toHaveLength(9);
  expect(new Set(expectedDashaRows).size, 'every expected dasha tuple must be unique').toBe(99);
  expect(downloadedDashaRows, 'the browser PDF must contain exactly 99 dasha rows').toHaveLength(99);
  expect(
    new Set(downloadedDashaRows).size,
    'the browser PDF must not duplicate any dasha row',
  ).toBe(99);
  expect([...downloadedDashaRows].sort()).toEqual([...expectedDashaRows].sort());

  const pdfText = (await pdfToText(MAXIMAL_DOWNLOAD_PATH)).toLowerCase();
  const pdfLines = pdfText.split('\n');
  const finalPratyantarRow = pdfLines
    .find((line) => line.includes('ketu') && line.includes('nov 2026') && line.includes('jan 2027'));
  expect(finalPratyantarRow, 'the final pratyantar row must survive the real download').toBeTruthy();
  const finalPlanetIndex = pdfLines.findIndex((line) => line.includes('final planet sentinel'));
  const finalPlanetRow = pdfLines.slice(finalPlanetIndex, finalPlanetIndex + 2).join(' ');
  expect(finalPlanetIndex, 'the final planet sentinel must survive the real download').toBeGreaterThanOrEqual(0);
  expect(finalPlanetRow, 'the final planet sentinel must remain attached to Ketu').toContain('ketu');
  const missLine = pdfLines.find(
    (line) =>
      line.includes('predicted a strong family rupture') &&
      line.includes('window with nothing reported'),
  );
  expect(missLine, 'the final quiet-period miss must survive the real download').toBeTruthy();
  for (const sentinel of [
    'pratyantar',
    'transits & timing',
    'd10',
    'd60',
    '165.00',
    '6.13',
    'life domains',
    'career',
    'birth time authority',
    'accepted the maximal browser sentinel role',
    'final yoga sentinel',
    'final paginated event sentinel',
    CURRENT_SKY_SENTINEL.toLowerCase(),
    '08:15',
    'timed to the sub-sub-period',
  ]) {
    expect(pdfText, `downloaded maximal PDF is missing ${sentinel}`).toContain(sentinel);
  }
});

test('a natal-only reading gone stale still prints its narrative in the downloaded PDF', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mkdir(OUT_DIR, { recursive: true });

  // THE REPORTED BUG. Seed a stored chart plus a COMPLETE natal-only reading
  // (`inputProvenance.predictiveRequestKey: null`) beside a `ready` predictive
  // slice carrying `rawContexts`. That is production, exactly: the moment the
  // predictive layer computes, a natal-only reading stops being "input-current"
  // and its status drops to 'idle'. The dashboard kept rendering the reading
  // from the permissive value while the export — gated on `status === 'complete'`
  // — dropped the whole Interpretation section without a word. `rawContexts` is
  // the load-bearing part of this fixture; remove it and the bug cannot fire.
  await seedSyntheticMaximalReport(page, { staleNatalOnlyReading: true });
  await page.goto('/report?mode=astrologer', { waitUntil: 'domcontentloaded' });

  const downloadBtn = page.getByTestId('report-download-pdf');
  await expect(
    downloadBtn,
    'a stale reading must not disable export — a stored chart is the only precondition',
  ).toBeVisible({ timeout: 30_000 });

  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    downloadBtn.click(),
  ]);
  await download.saveAs(STALE_DOWNLOAD_PATH);

  const pdfText = await pdfToText(STALE_DOWNLOAD_PATH);
  const flatPdfText = flattenPdfText(pdfText);

  // The section header is present...
  const headingNeedle = await interpretationHeadingNeedle();
  expect(
    flatPdfText,
    `the stale-status PDF must carry the Interpretation section ("${headingNeedle}")`,
  ).toContain(headingNeedle);

  // ...AND the seeded prose itself. Before the fix the PDF omitted the narrative
  // entirely — this pair of sentinels is the property under test.
  expect(
    flatPdfText,
    'the stale natal-only SUMMARY must survive into the downloaded PDF',
  ).toContain(flattenPdfText(NATAL_ONLY_SUMMARY_SENTINEL));
  expect(
    flatPdfText,
    'the stale natal-only STRENGTHS block must survive into the downloaded PDF',
  ).toContain(flattenPdfText(NATAL_ONLY_STRENGTH_SENTINEL));

  // And the "no reading" note must NOT appear — there IS a reading here, and
  // printing the honest-absence note beside real prose would be a new lie.
  const narrativeAbsentNote = await englishReportString('pdf.narrative_absent_note');
  expect(
    flatPdfText,
    'a report that HAS a reading must not also claim no reading was generated',
  ).not.toContain(flattenPdfText(narrativeAbsentNote));
});
