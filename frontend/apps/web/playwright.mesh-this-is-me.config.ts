import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

/**
 * Mesh "this is me" reachability — live-journey config.
 *
 * Drives the REAL production build through the flagship mesh journey
 * (create yourself → mark "this is me" → add a person → see the thread)
 * with zero store seeding and zero engine hooks: the mesh forms from the
 * profiles layer alone, so this lane stays fast.
 *
 * Run:  bun run playwright test --config=playwright.mesh-this-is-me.config.ts
 */

const PORT = Number(process.env.MESH_E2E_PORT ?? 4198);
const BASE_URL = process.env.MESH_E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /mesh-this-is-me\.spec\.ts/,
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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Plain production build — this journey needs no exit-gate hooks.
  webServer: {
    command: `VITE_API_URL= bun run build && VITE_API_URL= bun run preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    cwd: __dirname,
  },
});
