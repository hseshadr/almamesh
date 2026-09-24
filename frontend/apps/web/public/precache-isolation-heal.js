// Repair precached responses that predate cross-origin isolation.
//
// Workbox keeps a precache entry across deploys whenever its content-hashed URL
// is unchanged, together with the headers it was first fetched with. Chunks
// cached before the app shipped COOP/COEP (#157) therefore kept COEP-less
// headers. A cross-origin-isolated page refuses to start a dedicated Worker
// whose script response lacks `Cross-Origin-Embedder-Policy: require-corp`, so
// a returning visitor's chart Worker never loaded and the engine stayed
// "still starting up" forever.
//
// On activation, before this worker serves the isolated app, restamp every
// precached response that lacks require-corp with the isolation headers that
// public/_headers sets on every response. The bytes are unchanged: precache
// entries are content-addressed, so only the stale headers are replaced.
// Runtime caches (signed bundle, Pyodide, models) are never touched.
const ISOLATION_HEADERS = {
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
}

async function restampEntry(cache, request) {
  const response = await cache.match(request)
  if (!response || response.type === 'opaque') return
  if (response.headers.get('cross-origin-embedder-policy') === 'require-corp') return
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(ISOLATION_HEADERS)) headers.set(name, value)
  const body = await response.blob()
  await cache.put(request, new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  }))
}

async function healPrecacheIsolation() {
  for (const name of await caches.keys()) {
    if (!name.includes('-precache-')) continue
    const cache = await caches.open(name)
    for (const request of await cache.keys()) await restampEntry(cache, request)
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(healPrecacheIsolation())
})
