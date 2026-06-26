import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

/**
 * Dedicated Playwright config for the REAL dual-voice + foundational Life Atlas
 * gate (e2e/dual-voice-life-atlas.e2e.spec.ts).
 *
 * Like playwright.report-pdf.config.ts, this builds the app WITHOUT
 * `VITE_EXIT_GATE_HOOKS` — NO window.__almameshGenerate seed hook and NO
 * __ALMAMESH_STAGE__ observability. The spec drives the ACTUAL onboarding ->
 * engine-bootstrap -> Generate -> dashboard journey a real visitor walks.
 *
 * Check A (Life Atlas auto-compute) is deterministic and needs no LLM. Checks
 * B+C (dual-voice toggle + PDFs) self-skip unless OPENROUTER_API_KEY is set in
 * the parent shell (Playwright forwards it; it is NOT a VITE_ var and is never
 * bundled into the app — it is injected at runtime via a localStorage init
 * script seeding the OpenRouter cloud preset).
 *
 * Run:  bun run test:e2e:dual-voice   (from apps/web)
 */

const PORT = Number(process.env.DUAL_VOICE_E2E_PORT ?? 4198);
const BASE_URL = process.env.DUAL_VOICE_E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /dual-voice-life-atlas\.e2e\.spec\.ts/,
  // Heavy engine boot (Pyodide + OPFS bundle sync); one worker keeps OPFS /
  // IndexedDB state from colliding across parallel contexts.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 600_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: BASE_URL,
    headless: true,
    acceptDownloads: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Build with hooks OFF (the real visitor build), then serve the bundle.
  webServer: {
    command: `VITE_API_URL= bun run build && VITE_API_URL= bun run preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    cwd: __dirname,
  },
});
