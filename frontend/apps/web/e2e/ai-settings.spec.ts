import { test, expect, type Page } from '@playwright/test';

/**
 * AI / OpenRouter settings e2e gate.
 *
 * Locks in the fix that made the OpenRouter selector discoverable and reachable.
 * Before the fix the OpenRouter preset was buried inside the "Preferences" tab
 * with no entry point; now the header AI-status badge ("Set up AI") links to a
 * dedicated `/settings/ai` tab with a one-click "Use OpenRouter" button.
 *
 * This test deliberately exercises ONLY the settings UI + localStorage — it
 * never generates a chart, so it does not need the Pyodide engine / OPFS (which
 * crashes under headless Chromium in this environment). It runs against a
 * production build served by `vite preview` (see playwright.ai-settings.config.ts).
 *
 * Run:  bun run test:e2e:ai
 */

const LLM_SETTINGS_KEY = 'almamesh-llm-settings';
const OPENROUTER_BASE = 'openrouter.ai';
const OPENROUTER_MODEL = 'deepseek/deepseek-v4-pro';
const DUMMY_KEY = 'sk-or-test-dummy-key-1234567890';

/**
 * Start every test from a clean localStorage so the badge begins life in its
 * unconfigured ("Set up AI") state. We land on /settings/ai first (no chart
 * generation on this route), then wipe storage and reload to a pristine page.
 */
async function gotoCleanAiSettings(page: Page) {
  await page.goto('/settings/ai');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
}

test.describe('AI settings — discover and select OpenRouter', () => {
  test('user can reach /settings/ai, pick OpenRouter, and the badge reflects it', async ({
    page,
  }) => {
    await gotoCleanAiSettings(page);

    // --- Step 1: the AI Model page + "Use OpenRouter" are reachable ---------
    await expect(page).toHaveURL(/\/settings\/ai/);
    await expect(page.getByRole('heading', { name: 'AI Model' })).toBeVisible();

    const useOpenRouter = page.getByTestId('llm-use-openrouter');
    await expect(useOpenRouter).toBeVisible();

    // --- Step 2: header badge starts in the unconfigured state --------------
    const badge = page.getByTestId('ai-status-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/Set up AI/);

    // --- Step 3: one click prefills the OpenRouter preset + reveals the key --
    // The API-key field only renders once a cloud endpoint is selected.
    await expect(page.getByTestId('llm-api-key')).toHaveCount(0);
    await useOpenRouter.click();

    const apiKey = page.getByTestId('llm-api-key');
    await expect(apiKey).toBeVisible();

    await expect(page.getByTestId('llm-api-base')).toHaveValue(
      new RegExp(OPENROUTER_BASE),
    );
    await expect(page.getByTestId('llm-model')).toHaveValue(OPENROUTER_MODEL);
    // Cloud privacy mode must be on, else the fail-closed gate would refuse it.
    await expect(page.getByTestId('llm-allow-cloud')).toBeChecked();

    // --- Step 4: fill a dummy key and save ----------------------------------
    await apiKey.fill(DUMMY_KEY);
    await page.getByTestId('llm-save').click();
    await expect(page.getByText('Saved')).toBeVisible();

    // --- Step 5a: after a reload the badge reads "AI: OpenRouter" ------------
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('ai-status-badge')).toHaveText(/AI:\s*OpenRouter/);

    // --- Step 5b: localStorage persisted the OpenRouter settings ------------
    const saved = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    }, LLM_SETTINGS_KEY);

    expect(saved).not.toBeNull();
    expect(String(saved?.apiBase)).toContain(OPENROUTER_BASE);
    expect(saved?.apiKey).toBe(DUMMY_KEY);
    expect(saved?.privacyMode).toBe('cloud_premium');
    expect(saved?.model).toBe(OPENROUTER_MODEL);
  });
});
