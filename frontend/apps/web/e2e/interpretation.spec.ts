import { test, expect, type Page } from '@playwright/test';
import { bootEngine, seedChart, LLM_SETTINGS_KEY } from './interpretation.helpers';

/**
 * Structured Vedic interpretation UNIT / CONTRACT test — REAL chart, STUBBED LLM.
 *
 * This is the FAST contract gate: it boots the real in-browser Pyodide engine and
 * generates a REAL Delhi sidereal chart in-tab (via the shared helpers), but the
 * OpenAI-compatible LLM is STUBBED with `page.route`, so the section payloads are
 * deterministic canned JSON. It asserts the structured 5-section interpretation
 * renders, the loud-failure path, the KeyFocusCard dedup, and the no-model CTA —
 * all with byte-stable assertions. It does NOT touch any real LLM endpoint.
 *
 * For the REAL (unstubbed) integration test that hits a live local Ollama /
 * OpenRouter endpoint, see interpretation.real.spec.ts.
 *
 * WHY this works where a generic browser-MCP fails: the app's module Workers
 * only resolve in a production build, and the chart engine needs the
 * VITE_EXIT_GATE_HOOKS=1 `window.__almameshGenerate` hook. The dedicated config
 * (playwright.interpretation.config.ts) builds + previews exactly that.
 *
 * Run:  bun run test:e2e:interp
 */

// The LLM config that makes describeLlmStatus().configured === true (a cloud
// OpenRouter endpoint with an API key + model + cloud privacy mode). Installed
// via addInitScript BEFORE load so the dashboard auto-triggers generation.
const LLM_CONFIG = {
  apiBase: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-test',
  model: 'deepseek/deepseek-v4-pro',
  privacyMode: 'cloud_premium',
  engine: 'openai-http',
};

// ---------------------------------------------------------------------------
// LLM stub: section payloads (field names match the VedicInterpretation shape).
// The structured generator embeds a `SECTION:<key>` marker in each request body,
// so the route picks the right canned JSON by reading request.postData().
// ---------------------------------------------------------------------------
type SectionKey = 'core' | 'yoga' | 'guidance1' | 'guidance2' | 'remedial';

const SECTION_JSON: Record<SectionKey, unknown> = {
  core: {
    summary: 'STUB SUMMARY about this chart.',
    strengths: [
      { title: 'Determination', layman: 'You persevere.', technical: 'Mars-driven grit.' },
    ],
    challenges: [
      { title: 'Impatience', layman: 'Slow down.', technical: 'Mars excess.' },
    ],
    life_themes: [
      { title: 'Service', layman: 'You help others.', technical: '6th-house emphasis.' },
    ],
  },
  yoga: {
    integrated_yoga_narrative: {
      layman: 'Your life arc bends toward leadership.',
      technical: 'Raja yoga via kendra-trikona lords.',
    },
  },
  guidance1: {
    health_guidance: { layman: 'Rest more.', technical: '6th lord analysis.' },
    education_guidance: { layman: 'Keep learning.', technical: '5th lord.' },
    career_guidance: { layman: 'Lead teams.', technical: '10th lord strong.' },
    relationship_guidance: { layman: 'Communicate.', technical: '7th lord.' },
  },
  guidance2: {
    finances_guidance: { layman: 'Save steadily.', technical: '2nd/11th lords.' },
    spiritual_guidance: { layman: 'Reflect daily.', technical: '12th house.' },
    life_evolution_guidance: { layman: 'You grow through challenge.', technical: 'Dasha sequence.' },
  },
  remedial: {
    remedial_measures: { layman: 'Meditate and journal.', technical: 'Universal practices.' },
  },
};

function sectionFor(body: string | null): SectionKey | null {
  if (!body) return null;
  for (const key of Object.keys(SECTION_JSON) as SectionKey[]) {
    if (body.includes(`SECTION:${key}`)) return key;
  }
  return null;
}

/**
 * Intercept the OpenAI-compatible chat-completions endpoint and reply with an
 * OpenAI-shaped body whose message.content is the canned JSON for the section
 * the request asked for. The structured generator POSTs to
 * `<apiBase>/chat/completions` (here openrouter.ai/api/v1/chat/completions).
 */
async function stubLlm(page: Page) {
  await page.route('**/chat/completions', async (route) => {
    const body = route.request().postData();
    const section = sectionFor(body);
    if (!section) {
      // Unknown request — fail it so a missing marker is visible, not silent.
      return route.fulfill({ status: 400, body: 'no SECTION marker' });
    }
    const content = JSON.stringify(SECTION_JSON[section]);
    const openAiBody = JSON.stringify({ choices: [{ message: { content } }] });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: openAiBody,
    });
  });
}

// ===========================================================================
// Test 1 (unit/contract, stubbed LLM) — interpretation populates from the stub.
// ===========================================================================
test('[contract/stubbed] interpretation populates from the stubbed LLM on the dashboard', async ({ page }) => {
  // Install the LLM config BEFORE any app code runs, so describeLlmStatus()
  // already reports "configured" on first dashboard render (auto-generation).
  await page.addInitScript(
    ([key, cfg]) => {
      window.localStorage.setItem(key as string, cfg as string);
    },
    [LLM_SETTINGS_KEY, JSON.stringify(LLM_CONFIG)] as const,
  );
  await stubLlm(page);

  await bootEngine(page);
  const seeded = await seedChart(page);
  // Sanity: the REAL engine ran (Delhi 1990-01-15 12:00Z lagna == Gemini).
  expect(String(seeded.lagna).toLowerCase()).toBe('gemini');

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  // "The reading" section renders the stubbed summary as open editorial prose
  // (no accordion). Scope to the rendered <p> to avoid strict-mode multi-match.
  const summary = page
    .getByText('STUB SUMMARY about this chart.')
    .and(page.locator('p'));
  await expect(summary).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('reading-section')).toBeVisible();

  // The Life Atlas renders all seven domain cards immediately — in the honest
  // pending state here (no predictive compute was requested in this test).
  await expect(page.getByTestId('life-atlas')).toBeVisible();
  await expect(page.getByTestId('life-atlas-card-career')).toBeVisible();
  await expect(page.getByTestId('life-atlas-card-family')).toBeVisible();

  await page.screenshot({
    path: 'test-results/dashboard-new-ia.png',
    fullPage: true,
  });

  // The 5-section progress completes: the progress checklist (data-testid
  // 'interpretation-progress') is only shown while generating; once complete it
  // disappears and the real reading shows.
  await expect(page.getByTestId('interpretation-progress')).toHaveCount(0);

  // The "no interpretation" empty-state must NOT be present.
  await expect(page.getByText('Interpretation data not available')).toHaveCount(0);
  // The "connect an AI model" CTA must NOT show (a model IS configured).
  await expect(page.getByTestId('connect-ai-link')).toHaveCount(0);

  // Per-domain detail: /life/career carries the matching AI reading section,
  // and the global content-mode toggle flips its depth (layman → technical).
  await page.goto('/life/career', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('life-domain-ai')).toContainText('Lead teams.', {
    timeout: 30_000,
  });
  await page.getByTestId('astrologer-tab').click();
  await expect(page.getByTestId('life-domain-ai')).toContainText('10th lord strong.');

  await page.screenshot({
    path: 'test-results/interpretation-populated.png',
    fullPage: true,
  });
});

// ===========================================================================
// Test 1b — total LLM failure surfaces LOUDLY (regression guard).
// A configured model whose endpoint fails every section must NOT leave the
// dashboard blank. It must show the "could not be generated" panel + Retry.
// This is the exact regression: failures were swallowed and the run "completed"
// empty, rendering nothing and no explanation.
// ===========================================================================
test('a failing endpoint shows a loud error + Retry, never a blank dashboard', async ({ page }) => {
  await page.addInitScript(
    ([key, cfg]) => {
      window.localStorage.setItem(key as string, cfg as string);
    },
    [LLM_SETTINGS_KEY, JSON.stringify(LLM_CONFIG)] as const,
  );
  // Every section call fails with a 500 — simulates a wrong key / bad model /
  // upstream outage. The old code swallowed these and completed empty.
  await page.route('**/chat/completions', async (route) => {
    await route.fulfill({ status: 500, contentType: 'text/plain', body: 'upstream boom' });
  });

  await bootEngine(page);
  const seeded = await seedChart(page);
  expect(String(seeded.lagna).toLowerCase()).toBe('gemini');

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  // The error panel is shown (status === 'error'), NOT hidden (which is what a
  // silent empty 'complete' produced — the blank-dashboard bug).
  await expect(page.getByText('Interpretation could not be generated')).toBeVisible({
    timeout: 60_000,
  });
  // A retry affordance exists so the user is never stuck.
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  // The model IS configured, so the "connect a model" CTA must NOT show — this
  // proves the failure is reported as a failure, not mistaken for "no model".
  await expect(page.getByTestId('connect-ai-link')).toHaveCount(0);

  await page.screenshot({
    path: 'test-results/interpretation-error.png',
    fullPage: true,
  });
});

// ===========================================================================
// Test 3 — no LLM configured: the dashboard shows the "Connect an AI model" CTA.
// ===========================================================================
test('shows the Connect-an-AI CTA when no model is configured', async ({ page }) => {
  // Ensure NO llm config is present (clear it before app code runs).
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key as string);
  }, LLM_SETTINGS_KEY);
  // No stubLlm route — nothing should be called anyway.

  await bootEngine(page);
  await seedChart(page);

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  // The "Connect an AI model" CTA / link to /settings/ai is shown.
  const cta = page.getByTestId('connect-ai-link');
  await expect(cta).toBeVisible({ timeout: 60_000 });
  await expect(cta).toHaveAttribute('href', /\/settings\/ai/);

  // And no bare "Interpretation data not available" empty-state.
  await expect(page.getByText('Interpretation data not available')).toHaveCount(0);
});
