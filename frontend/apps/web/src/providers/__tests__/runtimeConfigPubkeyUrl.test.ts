import { describe, it, expect, afterEach } from 'vitest';

import { readRuntimeConfig } from '../AlmaMeshRuntimeProvider';

/**
 * REGRESSION (same failure class as the June P0 stale-pubkey incident): the
 * ed25519 verify key MUST be requested from the app origin's ROOT —
 * `/public.key` — no matter which route the document loaded on.
 *
 * Resolving it against `document.baseURI` made a hard load of a nested route
 * (e.g. `/rectify/<id>` or `/settings/profile`) request
 * `/rectify/public.key`; the SPA fallback answered with index.html, ed25519
 * signature verification failed closed, and the engine could never boot (or
 * reboot) from any nested route. The SW NetworkFirst rule also matches
 * `url.pathname === '/public.key'` exactly, so only the root-absolute path is
 * ever revalidated correctly.
 */
describe('readRuntimeConfig pubkeyUrl', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it.each(['/rectify/some-profile-id', '/settings/profile', '/mesh/member-1'])(
    'resolves the verify key to /public.key from the nested route %s',
    (route) => {
      window.history.pushState({}, '', route);
      const url = new URL(readRuntimeConfig().pubkeyUrl);
      expect(url.pathname).toBe('/public.key');
      expect(url.origin).toBe(window.location.origin);
    },
  );

  it('resolves the verify key to /public.key from a single-segment route', () => {
    window.history.pushState({}, '', '/dashboard');
    const url = new URL(readRuntimeConfig().pubkeyUrl);
    expect(url.pathname).toBe('/public.key');
    expect(url.origin).toBe(window.location.origin);
  });
});
