import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

/**
 * Playwright config for the service-worker update gate (e2e/sw-update.e2e.spec.ts).
 *
 * Unlike every other config here there is NO `webServer`: this gate needs one
 * origin that can swap between two different builds mid-test, so the spec starts
 * and owns that server itself (e2e/swUpdateServer.ts).
 *
 * The two builds come from `scripts/build-sw-update-fixtures.mjs`, which builds
 * this app twice into dist-sw-update/{a,b} with different content hashes. Build
 * them first:
 *
 *   node scripts/build-sw-update-fixtures.mjs
 *   bun run test:e2e:sw-update
 *
 * Service workers need a secure context; `http://localhost` qualifies, so no TLS
 * setup is needed. Each test gets a fresh browser context, hence a fresh SW
 * registration and a cold precache.
 */

const PORT = Number(process.env.SW_UPDATE_E2E_PORT ?? 4198);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /sw-update\.e2e\.spec\.ts/,
  // Both tests drive service-worker registration on one shared origin whose
  // served build is mutable global state — they must not overlap.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // A cold precache install plus two navigations; generous but bounded.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
