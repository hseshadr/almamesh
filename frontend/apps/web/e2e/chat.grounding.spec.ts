import { test, expect } from '@playwright/test';
import { bootEngine, seedChart, LLM_SETTINGS_KEY } from './interpretation.helpers';

/**
 * Chat-grounding CONTRACT test — REAL chart, STUBBED LLM.
 *
 * This is the fast, deterministic, CI-runnable proof of two branch changes that
 * previously had only unit coverage:
 *
 *   (b) the chat request that goes out on the wire uses the FAST chat model
 *       `minimax/minimax-m2.7`. This is applied by `applyChatModelPreference`
 *       ONLY on the default OpenRouter cloud preset (base startsWith
 *       OPENROUTER_API_BASE AND model === RECOMMENDED_CLOUD_MODEL). So this test
 *       seeds the OpenRouter preset and asserts the OUTBOUND chat body's
 *       `model` is the override — NOT the deeper `deepseek/deepseek-v4-pro`.
 *
 *   (c) the chat prompt REUSES the already-generated structured interpretation:
 *       `serializeInterpretationForChat` injects a "Your chart reading
 *       (already generated …)" block into the chat messages. So this test waits
 *       for the six-section reading to COMPLETE first, then asserts the outbound
 *       chat body carries that labelled block AND stubbed interpretation content
 *       — including the "Upcoming periods" group from the sixth section.
 *
 * It boots the REAL in-browser Pyodide engine and generates a REAL Delhi chart
 * in-tab (shared helpers), but the OpenAI-compatible LLM is STUBBED via a
 * page.route on the chat/completions endpoint. The route distinguishes the two
 * request shapes by the `SECTION:<key>` marker the structured generator embeds:
 *   - a request WITH a marker  → an interpretation section (answer with canned JSON)
 *   - a request WITHOUT a marker → the chat turn (capture body + reply with SSE)
 *
 * The chat path streams (`streamChatCompletion`, `stream: true`), so the stubbed
 * chat reply is a valid SSE stream (one delta + `[DONE]`) the panel can render.
 *
 * Run:  bun run test:e2e:chat:grounding   (from apps/web)
 */

// The OpenRouter cloud preset that makes describeLlmStatus().configured === true
// AND triggers applyChatModelPreference (base startsWith OPENROUTER_API_BASE,
// model === RECOMMENDED_CLOUD_MODEL "deepseek/deepseek-v4-pro"). Installed via
// addInitScript BEFORE load so the dashboard auto-generates the reading and the
// chat override fires. Mirrors interpretation.spec.ts's LLM_CONFIG.
const LLM_CONFIG = {
  apiBase: 'https://openrouter.ai/api/v1', // === OPENROUTER_API_BASE
  apiKey: 'test-key',
  model: 'deepseek/deepseek-v4-pro', // === RECOMMENDED_CLOUD_MODEL
  privacyMode: 'cloud_premium',
  engine: 'openai-http',
};

// The model the chat override (applyChatModelPreference → CHAT_CLOUD_MODEL) must
// produce on the wire. NOT the seeded deepseek deep model; NOT a bare "minimax".
const EXPECTED_CHAT_MODEL = 'minimax/minimax-m2.7';

// The exact label `interpretationBlock` (prompt.ts) prefixes the reused reading
// with. Asserting on this proves change (c) end-to-end.
const READING_BLOCK_LABEL = 'Your chart reading (already generated';

// Canned interpretation sections (field names match VedicInterpretation). The
// structured generator embeds a `SECTION:<key>` marker per request, so the route
// picks the right JSON by reading request.postData(). Mirrors
// interpretation.spec.ts. The distinctive summary string is later asserted to
// appear in the OUTBOUND chat body (proving the reading was reused).
//
// EVERY section the generator fans out MUST be listed here: the route treats any
// request WITHOUT a recognized marker as THE CHAT TURN, so a missing key makes
// that section's request (sent with the DEEP interpretation model — correct)
// masquerade as the chat request and fail the fast-model assertion. That is
// exactly how adding the sixth `upcoming_periods` section broke this gate.
type SectionKey =
  | 'core'
  | 'yoga'
  | 'guidance1'
  | 'guidance2'
  | 'remedial'
  | 'upcoming_periods';

const STUB_SUMMARY = 'STUB GROUNDING SUMMARY about this chart.';

// Distinctive sixth-section strings, asserted later in the OUTBOUND chat body —
// proving serializeInterpretationForChat carries the new "Upcoming periods"
// group into the chat prompt end-to-end.
const STUB_PERIOD_TITLE = 'Sun antardasha — 2027-01 to 2028-01';
const STUB_PERIOD_LAYMAN = 'STUB ROAD AHEAD: a year of visible momentum.';

const SECTION_JSON: Record<SectionKey, unknown> = {
  core: {
    summary: STUB_SUMMARY,
    strengths: [
      { title: 'Determination', layman: 'You persevere.', technical: 'Mars-driven grit.' },
    ],
    challenges: [{ title: 'Impatience', layman: 'Slow down.', technical: 'Mars excess.' }],
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
    life_evolution_guidance: {
      layman: 'You grow through challenge.',
      technical: 'Dasha sequence.',
    },
  },
  remedial: {
    remedial_measures: { layman: 'Meditate and journal.', technical: 'Universal practices.' },
  },
  upcoming_periods: {
    upcoming_periods: [
      {
        title: STUB_PERIOD_TITLE,
        layman: STUB_PERIOD_LAYMAN,
        technical: 'Sun in the 10th, dignified; rules the 3rd.',
      },
    ],
  },
};

function sectionFor(body: string | null): SectionKey | null {
  if (!body) return null;
  for (const key of Object.keys(SECTION_JSON) as SectionKey[]) {
    if (body.includes(`SECTION:${key}`)) return key;
  }
  return null;
}

/** A minimal but valid OpenAI SSE chat stream: one content delta + [DONE]. */
function chatSseStream(text: string): string {
  const delta = JSON.stringify({ choices: [{ delta: { content: text } }] });
  return `data: ${delta}\n\n` + 'data: [DONE]\n\n';
}

test('[contract/stubbed] chat reuses the reading + sends the fast chat model on the wire', async ({
  page,
}) => {
  // Install the OpenRouter preset BEFORE any app code runs so (1) the dashboard
  // reports "configured" and auto-generates the reading and (2) the chat path's
  // applyChatModelPreference override fires on first render.
  await page.addInitScript(
    ([key, cfg]) => {
      window.localStorage.setItem(key as string, cfg as string);
    },
    [LLM_SETTINGS_KEY, JSON.stringify(LLM_CONFIG)] as const,
  );

  // Capture every outbound chat-completions request body so we can split the
  // interpretation requests (SECTION marker) from the chat turn (no marker).
  const chatRequestBodies: string[] = [];
  const interpRequestCount = { n: 0 };

  await page.route('**/chat/completions', async (route) => {
    const body = route.request().postData();
    const section = sectionFor(body);
    if (section) {
      // An interpretation section: answer with the canned JSON so the 5-section
      // reading actually completes (non-streaming chatCompletionJson path).
      interpRequestCount.n += 1;
      const content = JSON.stringify(SECTION_JSON[section]);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content } }] }),
      });
    }
    // No SECTION marker → this is the CHAT turn. Capture the body for the
    // assertions, then stream back a minimal valid SSE reply so the panel
    // renders an answer (chat uses streamChatCompletion, stream: true).
    chatRequestBodies.push(body ?? '');
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: chatSseStream('Your strengths shine through this chart.'),
    });
  });

  // Boot the REAL engine + seed a REAL Delhi chart into IndexedDB.
  await bootEngine(page);
  const seeded = await seedChart(page);
  expect(String(seeded.lagna).toLowerCase()).toBe('gemini');

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  // 1) Wait for the six-section reading to COMPLETE. interpretationText is only
  //    reused when the stored entry's status === 'complete' (Dashboard.tsx), so
  //    this wait is load-bearing for change (c). Completion signal mirrors
  //    interpretation.spec.ts: the core summary renders AND the progress
  //    checklist is gone.
  const summary = page.getByText(STUB_SUMMARY).and(page.locator('p'));
  await expect(summary).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('interpretation-progress')).toHaveCount(0);
  expect(
    interpRequestCount.n,
    'all 6 interpretation sections (incl. upcoming_periods) should have been requested',
  ).toBeGreaterThanOrEqual(6);

  // 2) Open the chat panel and send a question (selectors from chat.rag.real.spec.ts).
  await page.getByTestId('floating-chat-button').click({ timeout: 60_000 });
  const chatInput = page.getByTestId('chat-input');
  await expect(chatInput).toBeVisible({ timeout: 30_000 });

  await chatInput.fill('What are my strengths?');
  await page.getByTestId('chat-send-button').click();

  // 3) Wait for the chat answer to render (the stubbed SSE token appears in the panel).
  const chatPanel = page.getByTestId('chat-panel');
  await expect(
    chatPanel.getByText('Your strengths shine through this chart.', { exact: false }),
  ).toBeVisible({ timeout: 60_000 });

  // 4) Wait until exactly one chat request (no SECTION marker) was captured.
  await expect
    .poll(() => chatRequestBodies.length, { timeout: 30_000, intervals: [250] })
    .toBeGreaterThanOrEqual(1);

  // The chat request must be DISTINCT from the interpretation section requests:
  // none of the captured chat bodies carry a SECTION marker.
  for (const raw of chatRequestBodies) {
    expect(sectionFor(raw), 'a chat request must NOT carry a SECTION marker').toBeNull();
  }

  const chatBody = JSON.parse(chatRequestBodies[0]) as {
    model: string;
    stream?: boolean;
    messages: { role: string; content: string }[];
  };

  // ---- ASSERTION (b): the fast chat model went out on the wire ----------------
  expect(
    chatBody.model,
    `outbound chat model must be the fast chat override "${EXPECTED_CHAT_MODEL}" ` +
      `(applyChatModelPreference fired on the OpenRouter preset), not the seeded ` +
      `deep model "${LLM_CONFIG.model}". Got "${chatBody.model}".`,
  ).toBe(EXPECTED_CHAT_MODEL);
  // Guard against a bare/partial slug regression.
  expect(chatBody.model, 'chat model must not be a bare "minimax" slug').not.toBe('minimax');
  expect(chatBody.model, 'chat model must not still be the deep interpretation model').not.toBe(
    LLM_CONFIG.model,
  );
  // The chat path streams.
  expect(chatBody.stream, 'chat request streams (stream: true)').toBe(true);

  // ---- ASSERTION (c): the chat prompt reused the already-generated reading ----
  const promptText = chatBody.messages.map((m) => m.content).join('\n');
  expect(
    promptText,
    `the chat prompt must inject the reused-reading block label "${READING_BLOCK_LABEL}…" ` +
      `(serializeInterpretationForChat / interpretationBlock). It was absent, so the ` +
      `chat did NOT reuse the generated interpretation.`,
  ).toContain(READING_BLOCK_LABEL);
  expect(
    promptText,
    `the reused-reading block must carry stubbed interpretation content ` +
      `("${STUB_SUMMARY}"); its absence means an EMPTY reading block was injected.`,
  ).toContain(STUB_SUMMARY);
  // The sixth section rides into chat too: serializeInterpretationForChat
  // appends the "Upcoming periods" group with the engine-dated stub window.
  expect(
    promptText,
    'the reused reading must include the serialized "Upcoming periods" group',
  ).toContain('Upcoming periods:');
  expect(
    promptText,
    `the upcoming-periods group must carry the stubbed dated window ` +
      `("${STUB_PERIOD_TITLE}") from the sixth interpretation section.`,
  ).toContain(STUB_PERIOD_TITLE);

  await page.screenshot({
    path: 'test-results/chat-grounding.png',
    fullPage: true,
  });
});
