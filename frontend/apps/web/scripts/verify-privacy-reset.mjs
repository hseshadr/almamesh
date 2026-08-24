import { chromium } from '@playwright/test';

const baseUrl = process.argv[2];
if (!baseUrl) throw new Error('Usage: node verify-privacy-reset.mjs <base-url>');

const origin = new URL(baseUrl).origin;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
await context.addInitScript(() => {
  let target = window;
  while (target) {
    Reflect.deleteProperty(target, 'showSaveFilePicker');
    target = Object.getPrototypeOf(target);
  }
  const createObjectUrl = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    window.__almameshBackupText = blob.text();
    return createObjectUrl(blob);
  };
  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target;
      if (anchor instanceof window.HTMLAnchorElement && anchor.download) {
        window.__almameshBackupFilename = anchor.download;
      }
    },
    true,
  );
});

const page = await context.newPage();
const errors = [];
const offOrigin = new Set();
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (new URL(request.url()).origin !== origin) offOrigin.add(request.url());
});

try {
  await page.goto(`${baseUrl}/settings/data`, { waitUntil: 'networkidle' });
  if (await page.evaluate(() => 'showSaveFilePicker' in window)) {
    throw new Error('Native save picker could not be disabled for the download proof');
  }
  const exportButton = page.getByTestId('backup-export-button');
  try {
    await exportButton.waitFor({ timeout: 10_000 });
  } catch {
    const body = (await page.locator('body').innerText()).slice(0, 500);
    throw new Error(
      `Backup page unavailable at ${page.url()}: ${errors.join(' | ')} :: ${body}`,
    );
  }
  await exportButton.click();
  await page.getByTestId('backup-status').waitFor();
  await page.waitForFunction(() => window.__almameshBackupFilename);
  const exported = await page.evaluate(async () => ({
    filename: window.__almameshBackupFilename,
    text: await window.__almameshBackupText,
  }));
  if (!exported.filename.startsWith('almamesh-backup-')) {
    throw new Error(`Backup filename contract failed: ${exported.filename}`);
  }
  const backup = JSON.parse(exported.text);

  await page.goto(`${baseUrl}/settings/preferences`, { waitUntil: 'networkidle' });
  await page.getByTestId('reset-start-fresh').click();
  await page.getByTestId('reset-confirm').click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 15_000 });

  if (backup.format !== 'almamesh-backup' || backup.formatVersion !== 1) {
    throw new Error('Backup envelope contract failed');
  }
  if (!backup.stores || typeof backup.stores !== 'object') {
    throw new Error('Backup stores are missing');
  }
  if (offOrigin.size > 0) throw new Error(`Off-origin requests: ${[...offOrigin].join(', ')}`);
  if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log('privacy: backup v1, reset /, zero egress, clean console');
} finally {
  await browser.close();
}
