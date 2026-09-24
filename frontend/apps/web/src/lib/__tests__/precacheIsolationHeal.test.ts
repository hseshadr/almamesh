import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression: returning visitors were stuck on "The chart engine is still
// starting up" forever. Workbox reuses a precache entry whenever its hashed URL
// is unchanged across deploys, so a worker chunk cached before the app became
// cross-origin isolated (#157) kept its original, COEP-less headers. A
// cross-origin-isolated page refuses to start a dedicated Worker whose script
// response lacks `Cross-Origin-Embedder-Policy: require-corp`, so the chart
// Worker never loaded. The service worker must repair those entries on
// activation, before it serves the isolated app.

const SCRIPT = readFileSync(resolve(__dirname, '../../../public/precache-isolation-heal.js'), 'utf8');
const PRECACHE = 'workbox-precache-v2-https://almamesh.com/';
const RUNTIME = 'almamesh-bundle-immutable';

type Store = Map<string, Map<string, Response>>;

function fakeCaches(store: Store) {
  const open = async (name: string) => {
    const entries = store.get(name) ?? new Map<string, Response>();
    store.set(name, entries);
    return {
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
      match: async (request: Request) => entries.get(request.url)?.clone(),
      put: async (request: Request, response: Response) => {
        entries.set(request.url, response);
      },
    };
  };
  return { keys: async () => [...store.keys()], open };
}

async function activate(store: Store): Promise<void> {
  const listeners: Record<string, (event: unknown) => void> = {};
  const self = { addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn) };
  new Function('self', 'caches', SCRIPT)(self, fakeCaches(store));
  let pending: Promise<unknown> = Promise.resolve();
  listeners.activate?.({ waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
}

function js(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/javascript', ...headers } });
}

const ISOLATED = { 'cross-origin-embedder-policy': 'require-corp', 'cross-origin-opener-policy': 'same-origin' };

describe('precache-isolation-heal service-worker script', () => {
  it('adds the isolation headers to a precached worker cached before COEP shipped, keeping its bytes', async () => {
    const url = 'https://almamesh.com/assets/chartWorker-CFKr72v0.js';
    const store: Store = new Map([[PRECACHE, new Map([[url, js('worker-bytes')]])]]);

    await activate(store);

    const healed = store.get(PRECACHE)?.get(url);
    expect(healed?.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    expect(healed?.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(healed?.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(healed?.headers.get('content-type')).toBe('application/javascript');
    expect(healed?.status).toBe(200);
    expect(await healed?.text()).toBe('worker-bytes');
  });

  it('leaves entries that already carry require-corp untouched', async () => {
    const url = 'https://almamesh.com/assets/edgeproc.worker-CAW1AnfA.js';
    const original = js('fresh', ISOLATED);
    const store: Store = new Map([[PRECACHE, new Map([[url, original]])]]);

    await activate(store);

    expect(store.get(PRECACHE)?.get(url)).toBe(original);
  });

  it('never rewrites non-precache caches (signed bundle, pyodide, models)', async () => {
    const url = 'https://almamesh.com/bundle/chunk/abc';
    const original = js('chunk');
    const store: Store = new Map([[RUNTIME, new Map([[url, original]])]]);

    await activate(store);

    expect(store.get(RUNTIME)?.get(url)).toBe(original);
  });
});
