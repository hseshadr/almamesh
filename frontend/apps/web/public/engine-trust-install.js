// Warm the release-matched NetworkFirst fallback before this service worker can
// control an offline navigation. Activation runs after Workbox has installed
// the app shell, avoiding concurrent CacheStorage writes on memory-tight WebKit.
// The cache name is derived from the exact key, so a waiting release never
// overwrites the active release's trust root.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const encoded = self.__ALMAMESH_TRUST_KEY_B64__
    const expectedHash = self.__ALMAMESH_TRUST_KEY_HASH__
    if (typeof encoded !== 'string' || typeof expectedHash !== 'string') {
      throw new Error('public key activation failed: build-bound key is missing')
    }
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    if (bytes.byteLength !== 32) throw new Error('public key install failed: expected 32 bytes')
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('').slice(0, 16)
    if (hash !== expectedHash) throw new Error('public key activation failed: hash mismatch')
    const cache = await caches.open(`almamesh-pubkey-${expectedHash}`)
    await cache.put('/public.key', new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    }))
    await self.clients.claim()
  })())
})
