/**
 * Applying a pending app update — the ONE path "Reload to update" takes.
 *
 * The bug this exists to fix (observed live on almamesh.com, 2026-08-01):
 * `build.json` served the new git SHA while returning visitors kept executing
 * the OLD chunks out of the Workbox precache, with the new service worker stuck
 * in `waiting`. The banner was on screen and clicking it did nothing.
 *
 * Why it did nothing: the banner has TWO triggers — the Workbox `waiting` event
 * and the /version.json poller — but only the first one reached a skipWaiting
 * path. A banner raised by the poller ran a bare `window.location.reload()`,
 * and a reload CANNOT activate a waiting worker: the old worker still controls
 * the page and still serves its old precached shell, so the reload lands on the
 * same stale build. Forever.
 *
 * The three steps that make the click always work:
 *
 *   1. `registration.update()` — re-check sw.js NOW. This step carries the fix.
 *      Measured in Chromium against two real builds of this app: after a deploy,
 *      a plain navigation leaves `registration.waiting` null indefinitely (still
 *      null after 20s and repeated reloads), while an explicit
 *      `registration.update()` produces a waiting worker in about one second.
 *      So Workbox's `waiting` event — the thing that sets `needRefresh` — never
 *      fires for a returning visitor here, which is why the poller was in
 *      practice the ONLY trigger that ever raised the banner, and why the branch
 *      it took being a no-op meant there was no working update path at all.
 *   2. postMessage SKIP_WAITING to `registration.waiting` — the NEW worker.
 *      Posting to `navigator.serviceWorker.controller` (the OLD, active worker)
 *      is a no-op, and was the second half of the same defect.
 *   3. reload on `controllerchange`, once the new worker takes over.
 *
 * Two invariants worth stating because they are easy to break later:
 *
 *   - The click ALWAYS ends in a reload. The timeout is armed before anything
 *     else, so a hung update check, a stalled install or a dropped message
 *     still moves the user. A dead button is the one outcome we cannot ship.
 *   - The `controllerchange` listener is per click, NOT global at boot. A new
 *     worker takes over every open tab; reloading tabs whose user did not ask
 *     for it would throw away whatever they were doing.
 *
 * This does NOT change `registerType: 'prompt'` semantics. Nothing activates
 * without a user click; we only make the click do what it always claimed to.
 */

import { safeWarn } from '@almamesh/shared-types';

/** The message the generated Workbox service worker listens for. */
const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;

/**
 * The never-a-dead-button bound, not the expected path: the normal click
 * reloads on `controllerchange` in a second or two. This only fires when the
 * update check, the install or the message goes nowhere, and it is deliberately
 * generous so a slow precache install is not cut short into a pointless reload.
 */
const ACTIVATION_TIMEOUT_MS = 10_000;

export interface ServiceWorkerUpdateOptions {
  /** Injected by tests; defaults to a real page reload. */
  reload?: () => void;
  /** Injected by tests; how long to wait for `controllerchange`. */
  timeoutMs?: number;
}

/** A one-shot reload that fires on `controllerchange`, on timeout, or on demand. */
function armReload(reload: () => void, timeoutMs: number): { now: () => void } {
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    clearTimeout(timer);
    navigator.serviceWorker.removeEventListener('controllerchange', fire);
    reload();
  };
  const timer = setTimeout(fire, timeoutMs);
  navigator.serviceWorker.addEventListener('controllerchange', fire);
  return { now: fire };
}

async function currentRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch (err) {
    safeWarn('sw.get_registration_failed', err);
    return null;
  }
}

/** Resolve once an installing worker has left the `installing` state. */
function settled(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const onChange = () => {
      if (worker.state === 'installing') return;
      worker.removeEventListener('statechange', onChange);
      resolve();
    };
    worker.addEventListener('statechange', onChange);
    onChange();
  });
}

/**
 * The worker to activate. Asks the browser to re-check sw.js first: the banner
 * may have been raised by the version poller, before the browser ever looked.
 */
async function waitingWorker(reg: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  if (reg.waiting) {
    return reg.waiting;
  }
  try {
    await reg.update();
  } catch (err) {
    safeWarn('sw.update_check_failed', err);
  }
  if (reg.installing) {
    await settled(reg.installing);
  }
  return reg.waiting ?? null;
}

/**
 * Activate the waiting service worker, then reload onto the new build.
 * Never rejects, and never leaves the page without reloading.
 */
export async function applyServiceWorkerUpdate(
  options: ServiceWorkerUpdateOptions = {},
): Promise<void> {
  const reload = options.reload ?? (() => window.location.reload());
  const registration = await currentRegistration();
  if (!registration) {
    reload();
    return;
  }
  // Armed BEFORE we touch the worker, so every path below still ends in a reload.
  const reloader = armReload(reload, options.timeoutMs ?? ACTIVATION_TIMEOUT_MS);
  const waiting = await waitingWorker(registration);
  if (!waiting) {
    reloader.now();
    return;
  }
  waiting.postMessage(SKIP_WAITING_MESSAGE);
}
