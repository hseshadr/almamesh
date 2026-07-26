import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

/**
 * Onboarding splash — responsive-layout config.
 *
 * The only lane that asserts GEOMETRY. `happy-dom` (the vitest environment)
 * computes no layout, so the unit suites structurally cannot catch a clipped
 * motif, an overflowing step row, or a page that is taller than the viewport.
 * Every other Playwright config here uses `devices['Desktop Chrome']`
 * unmodified (1280x720), so nothing covered mobile either.
 *
 * Runs the same spec across three real device-emulated viewports.
 *
 * Run:  bun run playwright test --config=playwright.onboarding.responsive.config.ts
 */

const PORT = Number(process.env.ONBOARDING_RESPONSIVE_E2E_PORT ?? 4199);
const BASE_URL = process.env.ONBOARDING_RESPONSIVE_E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /onboarding\.responsive\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Real device emulation (viewport + deviceScaleFactor + isMobile + touch),
    // not a resized desktop window — a resized window keeps desktop layout
    // semantics and silently hides exactly the bugs this lane exists to catch.
    // `browserName: 'chromium'` is deliberate: the iPhone/iPad presets default
    // to WebKit, and only the Chromium engine is provisioned in this repo's CI
    // and dev images. The device METRICS (viewport, DPR, isMobile, hasTouch)
    // are what these assertions depend on, and those carry over intact.
    { name: 'mobile-390', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'tablet-768', use: { ...devices['iPad Mini'], browserName: 'chromium' } },
    { name: 'laptop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `VITE_API_URL= bun run build && VITE_API_URL= bun run preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    cwd: __dirname,
  },
});
