import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

/**
 * Dedicated Playwright config for the Stage-5 REAL report-PDF gate
 * (e2e/report-pdf.e2e.spec.ts).
 *
 * CRITICAL: unlike every other e2e config here, this one builds the app WITHOUT
 * `VITE_EXIT_GATE_HOOKS` — there is NO window.__almameshGenerate seed hook and NO
 * __ALMAMESH_STAGE__ observability. The spec drives the ACTUAL onboarding ->
 * engine-bootstrap -> Generate -> dashboard journey a real visitor walks, then
 * rectifies + downloads the natal-only PDF. This is the project's hardest gate:
 * the hooked exit-gate has shipped a broken real onboarding CI-green before.
 *
 * WHY build+preview (not `vite dev`): the Pyodide chart Worker only resolves in a
 * production build. `VITE_API_URL=` keeps the app in zero-backend mode. No LLM
 * key is needed — the report's natal-only path renders without an interpretation.
 *
 * Run:  bun run test:e2e:report:pdf   (from apps/web)
 */

const PORT = Number(process.env.REPORT_PDF_E2E_PORT ?? 4196);
const BASE_URL = process.env.REPORT_PDF_E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /report-pdf\.e2e\.spec\.ts/,
  // The engine boot (Pyodide + OPFS bundle sync) is heavy; one worker at a time
  // keeps OPFS/IndexedDB state from colliding across parallel contexts.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // A cold real-onboarding bootstrap can take ~90s+ under headless Chromium.
  timeout: 360_000,
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
    timeout: 360_000,
    cwd: __dirname,
  },
});
