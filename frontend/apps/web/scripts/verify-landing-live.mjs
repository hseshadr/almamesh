/**
 * Ad-hoc live validation for the marketing splash (run against a production
 * build + preview). Asserts: the splash renders at `/`, the hero is reachable,
 * ZERO engine/bundle requests fire while on the landing, the console is clean,
 * and the CTA navigates to /onboarding while STARTING the engine bootstrap.
 *
 *   ./node_modules/.bin/vite preview --port 4199 --strictPort &
 *   node scripts/verify-landing-live.mjs http://localhost:4199
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:4199';
const ENGINE_RE = /\/(pyodide|bundle|models)\//;

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const engineRequests = [];
const consoleErrors = [];
page.on('request', (r) => {
  if (ENGINE_RE.test(new URL(r.url()).pathname)) engineRequests.push(r.url());
});
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// Fresh visitor (no chart) → landing.
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page
  .getByRole('heading', { level: 1, name: /Your real sky/i })
  .first()
  .waitFor({ state: 'visible', timeout: 15000 })
  .catch(() => {});

const headline = await page
  .getByRole('heading', { level: 1, name: /Your real sky/i })
  .first()
  .isVisible()
  .catch(() => false);
headline ? ok('hero headline visible at /') : fail('hero headline NOT visible at /');

const ctaHref = await page.getByTestId('hero-cta').getAttribute('href').catch(() => null);
ctaHref === '/onboarding'
  ? ok('hero CTA links to /onboarding')
  : fail(`hero CTA href is ${ctaHref}, expected /onboarding`);

// Let any deferred work settle, then assert no engine requests on the landing.
await page.waitForTimeout(1500);
engineRequests.length === 0
  ? ok('ZERO engine/bundle/models requests while on the landing')
  : fail(`engine requests fired on landing: ${engineRequests.join(', ')}`);

consoleErrors.length === 0
  ? ok('console clean on the landing')
  : fail(`console errors: ${consoleErrors.join(' | ')}`);

// Verify the founder note + comparison anchor render (content integrity).
const anchor = await page.getByTestId('why-anchor').textContent().catch(() => '');
/gift, not a scheme/i.test(anchor ?? '')
  ? ok('comparison anchor renders the approved copy')
  : fail('comparison anchor copy missing');

const sig = await page.getByTestId('founder-signature').textContent().catch(() => '');
sig?.trim() === '— Harish' ? ok('founder signature renders') : fail('founder signature missing');

// Intent → navigate to /onboarding and START the engine bootstrap.
await page.getByTestId('hero-cta').click();
await page.waitForURL(/\/onboarding/, { timeout: 15000 }).catch(() => {});
page.url().includes('/onboarding')
  ? ok('CTA navigates to /onboarding')
  : fail(`after CTA, url is ${page.url()}`);

await page
  .waitForRequest((r) => ENGINE_RE.test(new URL(r.url()).pathname), { timeout: 20000 })
  .then(() => ok('engine bootstrap STARTS after the CTA (prewarm/route entry)'))
  .catch(() => fail('engine bootstrap did NOT start after the CTA'));

await browser.close();

if (process.exitCode) {
  console.error('\nLANDING LIVE VALIDATION FAILED');
} else {
  console.log('\nLANDING LIVE VALIDATION PASSED');
}
