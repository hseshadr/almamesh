import { test, expect } from '@playwright/test';
import { bootEngine, seedChart, LLM_SETTINGS_KEY } from './interpretation.helpers';

/**
 * Dashboard LIVE validation against REAL OpenRouter — three headline changes:
 *
 *   A) Honest interpretation timer  — the generation panel shows
 *      `interpretation-elapsed` with a live `m:ss` timer + "1–3 minutes" copy,
 *      and NEVER the old "about 30 seconds" string.
 *   B) Life Phase card             — renders a real maha phase, not the
 *      "Life phase information not available" fallback.
 *   C) Agentic chat (the headline) — after the user explicitly enables agent
 *      mode, a `cloud_premium` OpenRouter model receives exactly the three local,
 *      read-only tools, calls the date/time tool, and receives its Asia/Kolkata
 *      result before answering. Also proves the typing indicator (`chat-loading`)
 *      shows before the first streamed token.
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

test('[real] dashboard: timer + life phase + local-time agentic chat', async ({
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

  // Observe (but never intercept) the live provider traffic. Interpretation
  // requests use the same endpoint, so retain only requests carrying the agent
  // tool contract. Request bodies contain prompts/tool data, never the API key.
  const agentRequestBodies: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/chat/completions')) return;
    try {
      const body = request.postDataJSON() as Record<string, unknown>;
      const tools = Array.isArray(body.tools) ? body.tools : [];
      const names = tools.flatMap((tool) => {
        if (typeof tool !== 'object' || tool === null) return [];
        const fn = (tool as { function?: unknown }).function;
        if (typeof fn !== 'object' || fn === null) return [];
        const name = (fn as { name?: unknown }).name;
        return typeof name === 'string' ? [name] : [];
      });
      if (names.includes('get_current_datetime')) agentRequestBodies.push(body);
    } catch {
      // Non-JSON requests cannot be part of the OpenAI-compatible agent loop.
    }
  });

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
  // Restore the real engine chart through the same backup-import boundary a
  // user exercises, so canonical OPFS SQLite owns the dashboard state.
  const seeded = await seedChart(page);
  expect(String(seeded.lagna).toLowerCase()).toBe('gemini');

  console.log(
    `[engine] lagna=${seeded.lagna} maha=${seeded.mahaLord}`,
  );

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  // ---------------------------------------------------------------------------
  // A) Honest interpretation timer — capture WHILE generation runs.
  // ---------------------------------------------------------------------------
  await page.getByRole('button', { name: 'Generate natal reading' }).click();
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
  // C) Agentic chat (HEADLINE) — opt in, ask a question whose answer must come
  //    from the caller-pinned clock, then prove the complete live tool protocol.
  // ---------------------------------------------------------------------------
  await page.getByTestId('floating-chat-button').click();
  const chatInput = page.getByTestId('chat-input');
  await expect(chatInput).toBeVisible({ timeout: 15_000 });

  const agentMode = page.getByTestId('chat-agent-mode');
  await agentMode.click();
  await expect(agentMode).toHaveAttribute('aria-checked', 'true');

  await chatInput.fill(
    'Use the available local date/time tool with scope="chart", not training data, to tell me the current date and time in my chart timezone. Include the timezone and UTC offset.',
  );
  await page.getByTestId('chat-send-button').click();

  // (i) The typing indicator (chat-loading dots) must show BEFORE any answer
  //     text streams in — this also covers the agentic tool-lookup pause.
  await expect(page.getByTestId('chat-loading')).toBeVisible({ timeout: 60_000 });
  await page.screenshot({
    path: '/tmp/almamesh-verify/chat-local-time.png',
    fullPage: true,
  });

  // The concrete local capability stays visible while the provider consumes
  // its result, making the otherwise-fast synchronous tool call perceptible.
  await expect(page.getByTestId('chat-agent-status')).toContainText(
    'Checking the current time',
    { timeout: 180_000 },
  );

  // (ii) An answer then STREAMS into the chat panel. Wait for a substantive
  //      assistant message to appear (the tool loop + first-pass decision can
  //      take a while on a reasoning model).
  const assistantMessage = page.getByTestId('chat-message-assistant').last();
  await expect(assistantMessage).toBeVisible({ timeout: 480_000 });
  await expect(assistantMessage).toContainText(/Asia\/Kolkata|UTC\+?05:30|India/i, {
    timeout: 480_000,
  });
  const answerText = (await assistantMessage.textContent()) ?? '';

  await page.screenshot({
    path: '/tmp/almamesh-verify/chat-local-time.png',
    fullPage: true,
  });

  const lower = answerText.toLowerCase();

  console.log(`[chat answer] ${answerText.replace(/\s+/g, ' ').trim().slice(0, 600)}`);

  // Not a placeholder / error bubble.
  for (const placeholder of PLACEHOLDERS) {
    expect(lower).not.toContain(placeholder);
  }

  // THE TOOL-PROTOCOL ASSERTIONS: the live model first saw the exact fixed
  // allowlist, then a later provider request carried the locally executed
  // Asia/Kolkata result. This proves tool use, rather than inferring it from
  // plausible prose in the answer.
  await expect
    .poll(() => agentRequestBodies.length, {
      timeout: 480_000,
      intervals: [1_000],
    })
    .toBeGreaterThanOrEqual(2);

  const firstAgentRequest = agentRequestBodies[0] as {
    stream?: unknown;
    tool_choice?: unknown;
    tools?: Array<{ function?: { name?: string } }>;
  };
  expect(firstAgentRequest.stream).toBe(false);
  expect(firstAgentRequest.tool_choice).toBe('auto');
  expect(firstAgentRequest.tools?.map((tool) => tool.function?.name)).toEqual([
    'get_current_datetime',
    'get_chart_facts',
    'get_current_timing',
  ]);

  const requestWithToolResult = agentRequestBodies.find((body) => {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    return messages.some(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { role?: unknown }).role === 'tool',
    );
  }) as
    | { messages?: Array<{ role?: string; name?: string; content?: string }> }
    | undefined;
  expect(requestWithToolResult, 'the provider must receive a local tool result').toBeTruthy();
  const returnedToolResult = requestWithToolResult?.messages?.find(
    (message) => message.role === 'tool' && message.name === 'get_current_datetime',
  );
  expect(returnedToolResult?.content).toContain('"timeZone":"Asia/Kolkata"');
  expect(returnedToolResult?.content).toContain('"utcOffset":"+05:30"');

  // No hard request failures during the flow.
  for (const fragment of ['LlmRequestError', 'CORS', 'Failed to fetch']) {
    expect(
      errors.some((e) => e.includes(fragment)),
      `console error contained "${fragment}": ${errors.join(' | ')}`,
    ).toBe(false);
  }
});
