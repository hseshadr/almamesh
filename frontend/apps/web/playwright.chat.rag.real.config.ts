import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

/**
 * Dedicated Playwright config for the REAL "Ask About Your Chart" chat gate.
 *
 * Mirrors playwright.dashboard.agentic.real.config.ts (build + preview the
 * production bundle with VITE_EXIT_GATE_HOOKS=1 so window.__almameshGenerate
 * exists) but runs chat.rag.real.spec.ts — single-pass streaming, self-hosted
 * RAG embedder, per-profile persistence, and the semantic search box, against a
 * LIVE OpenRouter endpoint. Runs on its own port (4177) so it never collides.
 *
 * OPENROUTER_API_KEY is read from the parent shell env (Playwright forwards it
 * automatically). It is NOT in webServer.env and is NOT a VITE_ var, so the key
 * is never bundled into the app.
 *
 * Run:  bun run test:e2e:chat:rag:real   (from apps/web)
 */

const PORT = Number(process.env.CHAT_RAG_E2E_PORT ?? 4177);
const BASE_URL = process.env.CHAT_RAG_E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /chat\.rag\.real\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 600_000,
  expect: { timeout: 180_000 },
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
  webServer: {
    command: `VITE_API_URL= VITE_EXIT_GATE_HOOKS=1 bun run build && VITE_API_URL= bun run preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 300_000,
    cwd: __dirname,
  },
});
