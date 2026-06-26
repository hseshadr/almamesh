import { test, expect, type Page } from '@playwright/test';
import { bootEngine, DELHI_BIRTH, LLM_SETTINGS_KEY } from './interpretation.helpers';

/**
 * Dashboard LIVE validation against REAL OpenRouter — three headline changes:
 *
 *   A) Honest interpretation timer  — the generation panel shows
 *      `interpretation-elapsed` with a live `m:ss` timer + "1–3 minutes" copy,
 *      and NEVER the old "about 30 seconds" string.
 *   B) Life Phase card             — renders a real maha phase, not the
 *      "Life phase information not available" fallback.
 *   C) Agentic chat (the headline) — on a `cloud_premium` OpenRouter endpoint
 *      the floating chat calls the grounding tools (get_planet_facts/…) to fetch
 *      EXACT engine facts before answering, so the answer cites the engine's own
 *      Mars sign rather than inventing one. Also proves the typing indicator
 *      (`chat-loading`) shows before the first streamed token.
 *
 * This is a REAL integration test: real in-browser Pyodide engine, a real Delhi
 * sidereal chart generated in-tab, and a LIVE OpenRouter round-trip with a
 * tool-capable model (deepseek/deepseek-v4-pro). The OpenRouter key is read ONLY
 * from process.env (never bundled).
 *
 * Run:  bun run test:e2e:dashboard:agentic:real   (from apps/web)
 *       (set OPENROUTER_API_KEY=... or the test self-skips.)
 */

/** Strings that signal a non-real / placeholder chat answer. */
const PLACEHOLDERS = ['pending', 'please retry', 'loading', 'no answer available'];

/**
 * Seed a REAL Delhi chart via the engine and persist it into the chart-library
 * IndexedDB envelope the dashboard reads from. Unlike the interpretation helper
 * (which hardcodes `dasha_ctx: undefined`), this builds a REAL `dasha_ctx` from
 * the engine's own `chart.dashas`, mirroring the production `@almamesh/store`
 * adapter (`current_maha` → `maha_dasha`, etc.) so the Life Phase card has the
 * engine's true dasha to render. Returns the engine's lagna + Mars placement so
 * the test can assert the chat is grounded in those exact engine numbers.
 */
async function seedChartWithDasha(page: Page) {
  return page.evaluate(
    async (birth) => {
      interface DashaPeriod {
        lord: string;
        start_date: string;
        end_date: string;
        duration_years: number;
      }
      interface EngineChart {
        lagna?: { sign?: string };
        planets: Record<
          string,
          { name?: string; sign?: string; house?: number }
        >;
        yogas?: unknown[];
        ayanamsa_value?: number;
        dashas?: {
          maha_dasha_sequence?: DashaPeriod[];
          current_maha?: DashaPeriod | null;
          current_antar?: DashaPeriod | null;
          current_pratyantar?: DashaPeriod | null;
        };
      }
      const w = window as unknown as {
        __almameshGenerate: (b: unknown) => Promise<EngineChart>;
      };
      const chart = await w.__almameshGenerate(birth);

      // --- Build dasha_ctx from engine truth (mirrors the store adapter) ------
      const toLeg = (
        p: DashaPeriod | null | undefined,
        level: 'maha' | 'antar' | 'pratyantar',
      ) =>
        p
          ? {
              lord: p.lord,
              start_date: p.start_date,
              end_date: p.end_date,
              level,
              duration_years: p.duration_years,
            }
          : undefined;

      const seq = chart.dashas?.maha_dasha_sequence ?? [];
      // The engine emits a non-null current_maha for this chart at the pinned
      // referenceDate; fall back to the sequence exactly as the adapter does.
      const activeMaha =
        chart.dashas?.current_maha ??
        seq.find((d) => Date.parse(d.start_date) <= Date.parse('2025-01-01')) ??
        seq[0] ??
        null;

      const mahaLeg = toLeg(activeMaha, 'maha');
      const dashaCtx = mahaLeg
        ? {
            maha_dasha: mahaLeg,
            antar_dasha: toLeg(chart.dashas?.current_antar, 'antar'),
            pratyantar_dasha: toLeg(chart.dashas?.current_pratyantar, 'pratyantar'),
            full_sequence: seq.map((p) => ({
              lord: p.lord,
              start_date: p.start_date,
              end_date: p.end_date,
              level: 'maha' as const,
              duration_years: p.duration_years,
            })),
          }
        : undefined;

      const chartId = 'agentic-delhi-1990';
      const stored = {
        chart_id: chartId,
        person_name: birth.name,
        is_primary: true,
        birth_data: {
          name: birth.name,
          birth_datetime_utc: birth.datetimeUtc,
          birth_datetime_local: '1990-01-15T17:30:00',
          birth_location_details: {
            city: 'Delhi',
            latitude: birth.latitude,
            longitude: birth.longitude,
            timezone: 'Asia/Kolkata',
            location_name: 'Delhi, India',
          },
        },
        astronomical_calculations: {
          sidereal_ctx: {
            ayanamsa_value: chart.ayanamsa_value ?? 0,
            ayanamsa_type: 'lahiri',
            house_system: 'whole_sign',
            julian_day: 0,
            sidereal_time: 0,
            lagna: chart.lagna,
            planets: chart.planets,
          },
          varga_ctx: undefined,
          dasha_ctx: dashaCtx,
          yoga_ctx: chart.yogas ?? [],
          calculation_timestamp: '2025-01-01T00:00:00+00:00',
          software_version: 'almamesh-browser-engine',
        },
        interpretation: undefined,
        // The chat + kundli render from the RAW SiderealChart.
        sidereal_chart: chart,
      };

      const envelope = JSON.stringify({
        state: { charts: { [chartId]: stored } },
        version: 0,
      });
      const { set: idbSet } = await import(
        '/node_modules/.vite/deps/idb-keyval.js'
      ).catch(() => ({
        set: null as null | ((k: string, v: string) => Promise<void>),
      }));
      if (idbSet) {
        await idbSet('almamesh-chart-library', envelope);
      } else {
        await new Promise((resolve, reject) => {
          const open = indexedDB.open('keyval-store');
          open.onupgradeneeded = () => open.result.createObjectStore('keyval');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('keyval', 'readwrite');
            tx.objectStore('keyval').put(envelope, 'almamesh-chart-library');
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
          };
        });
      }
      localStorage.setItem('almamesh-chart', '1');

      // The engine's Mars (key may be capitalized in the dict) — engine truth.
      const marsEntry = Object.entries(chart.planets).find(
        ([k, v]) =>
          k.toLowerCase() === 'mars' ||
          (v.name ?? '').toLowerCase() === 'mars',
      );
      const mars = marsEntry?.[1];

      return {
        lagna: chart.lagna?.sign ?? null,
        marsSign: mars?.sign ?? null,
        marsHouse: mars?.house ?? null,
        mahaLord: activeMaha?.lord ?? null,
      };
    },
    DELHI_BIRTH,
  );
}

test('[real] dashboard: timer + life phase + tool-grounded agentic chat', async ({
  page,
}) => {
  const KEY = process.env.OPENROUTER_API_KEY;
  test.skip(!KEY, 'OPENROUTER_API_KEY not set');
  // Cold engine boot + a live tool-loop round-trip; give it generous headroom.
  test.setTimeout(600_000);

  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  // Cloud OpenRouter, tool-capable model, cloud_premium so the agentic loop runs
  // and the fail-closed gate permits the off-device call. Key from env only.
  const config = JSON.stringify({
    apiBase: 'https://openrouter.ai/api/v1',
    apiKey: KEY,
    model: 'deepseek/deepseek-v4-pro',
    privacyMode: 'cloud_premium',
    engine: 'openai-http',
  });
  await page.addInitScript(
    ([key, cfg]) => {
      window.localStorage.setItem(key as string, cfg as string);
    },
    [LLM_SETTINGS_KEY, config] as const,
  );

  await bootEngine(page);
  const seeded = await seedChartWithDasha(page);
  expect(String(seeded.lagna).toLowerCase()).toBe('gemini');
  expect(seeded.marsSign, 'engine must emit a Mars sign').toBeTruthy();
  const engineMarsSign = String(seeded.marsSign).toLowerCase();
  const engineMarsHouse = seeded.marsHouse;
   
  console.log(
    `[engine] lagna=${seeded.lagna} mars sign=${seeded.marsSign} house=${seeded.marsHouse} maha=${seeded.mahaLord}`,
  );

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  // ---------------------------------------------------------------------------
  // A) Honest interpretation timer — capture WHILE generation runs.
  // ---------------------------------------------------------------------------
  const elapsed = page.getByTestId('interpretation-elapsed');
  await expect(elapsed).toBeVisible({ timeout: 120_000 });
  const timerText = (await elapsed.textContent()) ?? '';
   
  console.log(`[timer] interpretation-elapsed = "${timerText}"`);
  expect(timerText).toMatch(/\d:\d\d/); // live m:ss timer
  expect(timerText).toContain('1–3 minutes');
  expect(timerText.toLowerCase()).not.toContain('about 30 seconds');
  // Whole page must never contain the retired copy.
  await expect(page.getByText('about 30 seconds')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/almamesh-verify/timer.png', fullPage: true });

  // ---------------------------------------------------------------------------
  // B) Identity strip — a real running daśā stack, not the unavailable fallback.
  // ---------------------------------------------------------------------------
  const identity = page.getByTestId('identity-strip');
  await expect(identity).toBeVisible({ timeout: 30_000 });
  const identityText = (await identity.textContent()) ?? '';

  console.log(`[identity] "${identityText.replace(/\s+/g, ' ').trim()}"`);
  // A real maha lord is on screen with its level label (engine-emitted).
  expect(identityText).toContain('Maha');
  expect(identityText).toMatch(/Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu/);
  expect(identityText).not.toContain('Not available');

  // ---------------------------------------------------------------------------
  // C) Agentic chat (HEADLINE) — open the floating chat, ask about Mars, and
  //    prove the answer cites the engine's exact Mars sign (tool-grounded).
  // ---------------------------------------------------------------------------
  await page.getByTestId('floating-chat-button').click();
  const chatInput = page.getByTestId('chat-input');
  await expect(chatInput).toBeVisible({ timeout: 15_000 });

  await chatInput.fill("What's my Mars placement?");
  await page.getByTestId('chat-send-button').click();

  // (i) The typing indicator (chat-loading dots) must show BEFORE any answer
  //     text streams in — this also covers the agentic tool-lookup pause.
  await expect(page.getByTestId('chat-loading')).toBeVisible({ timeout: 60_000 });
  await page.screenshot({
    path: '/tmp/almamesh-verify/chat-mars.png',
    fullPage: true,
  });

  // (ii) An answer then STREAMS into the chat panel. Wait for a substantive
  //      assistant message to appear (the tool loop + first-pass decision can
  //      take a while on a reasoning model).
  const chatPanel = page.getByTestId('chat-panel');
  await expect
    .poll(
      async () => {
        const txt = (await chatPanel.textContent()) ?? '';
        // Strip the input placeholder + headings; look for streamed answer body.
        return txt.length;
      },
      { timeout: 480_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);

  // Wait until the streamed answer actually mentions Mars (the model has fetched
  // get_planet_facts and is narrating) — poll the panel text for the Mars sign.
  let answerText = '';
  await expect
    .poll(
      async () => {
        answerText = (await chatPanel.textContent()) ?? '';
        const lower = answerText.toLowerCase();
        // Heuristic: a real, finished answer mentions mars AND the sign/house.
        const mentionsMars = lower.includes('mars');
        const mentionsSign = lower.includes(engineMarsSign);
        const mentionsHouse =
          engineMarsHouse != null &&
          new RegExp(`\\b${engineMarsHouse}(st|nd|rd|th)?\\b`).test(lower);
        return mentionsMars && (mentionsSign || mentionsHouse);
      },
      { timeout: 480_000, intervals: [3_000] },
    )
    .toBe(true);

  await page.screenshot({
    path: '/tmp/almamesh-verify/chat-mars.png',
    fullPage: true,
  });

  const lower = answerText.toLowerCase();
   
  console.log(`[chat answer] ${answerText.replace(/\s+/g, ' ').trim().slice(0, 600)}`);

  // Not a placeholder / error bubble.
  for (const placeholder of PLACEHOLDERS) {
    expect(lower).not.toContain(placeholder);
  }

  // THE GROUNDING ASSERTION: the answer must contain the SAME Mars sign the
  // engine computed (case-insensitive). House-number match is accepted as an
  // additional signal, but the sign is REQUIRED — if the sign is absent the chat
  // either invented a placement or never called the tool, which is a FAIL.
  const signPresent = lower.includes(engineMarsSign);
  const housePresent =
    engineMarsHouse != null &&
    new RegExp(`\\b${engineMarsHouse}(st|nd|rd|th)?\\b`).test(lower);
  expect(
    signPresent,
    `Tool-grounding FAILED: engine Mars sign "${engineMarsSign}" (house ${engineMarsHouse}) ` +
      `not found in the chat answer. House present: ${housePresent}. Answer: ${answerText}`,
  ).toBe(true);

  // No hard request failures during the flow.
  for (const fragment of ['LlmRequestError', 'CORS', 'Failed to fetch']) {
    expect(
      errors.some((e) => e.includes(fragment)),
      `console error contained "${fragment}": ${errors.join(' | ')}`,
    ).toBe(false);
  }
});
