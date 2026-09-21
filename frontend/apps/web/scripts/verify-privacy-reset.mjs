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

async function openKeyvalDatabase() {
  return page.evaluateHandle(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('keyval')) {
            request.result.createObjectStore('keyval');
          }
        };
        request.onsuccess = () => resolve(request.result);
      }),
  );
}

async function putIdbValue(key, value) {
  const database = await openKeyvalDatabase();
  try {
    await page.evaluate(
      ([db, entryKey, entryValue]) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction('keyval', 'readwrite');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => resolve();
          transaction.objectStore('keyval').put(entryValue, entryKey);
        }),
      [database, key, value],
    );
  } finally {
    await database.evaluate((db) => db.close());
    await database.dispose();
  }
}

async function getIdbValue(key) {
  const database = await openKeyvalDatabase();
  try {
    return await page.evaluate(
      ([db, entryKey]) =>
        new Promise((resolve, reject) => {
          const request = db.transaction('keyval', 'readonly').objectStore('keyval').get(entryKey);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result ?? null);
        }),
      [database, key],
    );
  } finally {
    await database.evaluate((db) => db.close());
    await database.dispose();
  }
}

async function resetDiagnostics() {
  const confirm = page.getByTestId('reset-confirm');
  return {
    url: page.url(),
    errors,
    confirmCount: await confirm.count(),
    confirmDisabled: (await confirm.count()) > 0 ? await confirm.isDisabled() : null,
    body: (await page.locator('body').innerText()).slice(0, 500),
  };
}

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
  await page.evaluate(() => {
    localStorage.setItem('almamesh-chart', '1');
    localStorage.setItem('almamesh-interpretations', 'reset-proof');
  });
  await putIdbValue('almamesh-chart-library', 'reset-proof');
  try {
    await page.getByTestId('reset-start-fresh').click();
    await page.getByTestId('reset-confirm').click();
    await page.getByTestId('landing-nav-cta').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(
      () =>
        localStorage.getItem('almamesh-chart') === null &&
        localStorage.getItem('almamesh-interpretations') === null,
      undefined,
      { timeout: 10_000 },
    );
    if ((await getIdbValue('almamesh-chart-library')) !== null) {
      throw new Error('IndexedDB chart library survived reset');
    }
    if (new URL(page.url()).pathname !== '/') {
      throw new Error(`Reset route differs: ${page.url()}`);
    }
  } catch (error) {
    throw new Error(
      `Reset postcondition failed: ${error instanceof Error ? error.message : String(error)} :: ${JSON.stringify(await resetDiagnostics())}`,
    );
  }

  if (backup.format !== 'almamesh-backup' || backup.formatVersion !== 1) {
    throw new Error('Backup envelope contract failed');
  }
  if (!backup.stores || typeof backup.stores !== 'object') {
    throw new Error('Backup stores are missing');
  }
  if (offOrigin.size > 0) throw new Error(`Off-origin requests: ${[...offOrigin].join(', ')}`);
  if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log('privacy: backup v1, durable reset + landing, zero egress, clean console');
} finally {
  await browser.close();
}
