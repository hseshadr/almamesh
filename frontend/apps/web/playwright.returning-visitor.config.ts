import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

/**
 * Returning-visitor engine gate (e2e/returning-visitor-engine.e2e.spec.ts).
 *
 * Serves an existing PRODUCTION build (hooks off; default `dist-real`, override
 * with RETURNING_VISITOR_BUILD_DIR) from a spec-owned origin that can change
 * response headers mid-test, so there is no `webServer`. Build first:
 *
 *   VITE_EXIT_GATE_HOOKS= ./node_modules/.bin/vite build --outDir dist-real
 *   bun run test:e2e:returning-visitor
 */
const PORT = Number(process.env.RETURNING_VISITOR_E2E_PORT ?? 4197);

export default defineConfig({
  testDir: './e2e',
  testMatch: /returning-visitor-engine\.e2e\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
