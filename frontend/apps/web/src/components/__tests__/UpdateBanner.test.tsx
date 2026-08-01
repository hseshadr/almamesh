import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// `virtual:pwa-register` is stubbed via a vitest.config alias — it never reports
// an update, so `needRefresh` stays false and only the version poller can raise
// the banner. That is exactly the branch this file guards.
vi.mock('../../lib/swSelfHeal', () => ({ healStrandedServiceWorker: vi.fn() }));
vi.mock('../../lib/swUpdate', () => ({ applyServiceWorkerUpdate: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { applyServiceWorkerUpdate } from '../../lib/swUpdate';
import { UpdateBanner } from '../UpdateBanner';

const applyUpdate = vi.mocked(applyServiceWorkerUpdate);

/** Serve /version.json, changing the version on the Nth call to fake a deploy. */
function stubVersionEndpoint(versions: string[]) {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const version = versions[Math.min(call++, versions.length - 1)];
      return {
        ok: true,
        json: async () => ({ version, buildTime: '2026-08-01T00:00:00Z' }),
      } as Response;
    }),
  );
}

/**
 * Render, let the boot-time version check settle, then fake a deploy by firing
 * the window focus the poller listens for. Sequencing matters: the poller drops
 * a concurrent check, so a focus fired while the first fetch is in flight is
 * silently ignored.
 */
async function renderAndDeploy() {
  render(<UpdateBanner />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  window.dispatchEvent(new Event('focus'));
}

beforeEach(() => {
  applyUpdate.mockClear();
  vi.stubGlobal('navigator', { ...navigator, storage: { persist: async () => true } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UpdateBanner', () => {
  it('applies the service-worker update when the version poller raised the banner', async () => {
    // THE REGRESSION. Only /version.json noticed the deploy — the browser has
    // not re-checked sw.js, so Workbox reports nothing and `needRefresh` is
    // false. This branch used to run a bare window.location.reload(), which
    // cannot activate a waiting worker, leaving the user on the stale build.
    stubVersionEndpoint(['build-1', 'build-2']);
    await renderAndDeploy();

    const cta = await screen.findByRole('button', { name: 'update.reload_cta' });
    await userEvent.click(cta);

    await waitFor(() => expect(applyUpdate).toHaveBeenCalledTimes(1));
  });

  it('stays hidden while the deployed version is unchanged', async () => {
    stubVersionEndpoint(['build-1']);
    await renderAndDeploy();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'update.reload_cta' })).toBeNull();
  });

  it('sits above the app chrome so the CTA cannot be buried', async () => {
    // The landing header is `sticky top-0 z-50` and comes later in the DOM, so
    // an equal z-index paints over this banner: invisible and unclickable.
    stubVersionEndpoint(['build-1', 'build-2']);
    await renderAndDeploy();

    const banner = await screen.findByRole('status');

    expect(banner.className).toContain('z-[60]');
    expect(banner.className).not.toMatch(/\bz-50\b/);
  });
});
