import { createLogger, defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { writeFileSync } from 'fs'
import { createHash } from 'crypto'

// Pyodide's `pyodide.mjs` statically imports Node builtins (`node:fs`, `node:url`,
// …) behind runtime environment guards that NEVER execute in the browser. Vite
// correctly externalizes them to browser-safe stubs, but emits a "Module has been
// externalized for browser compatibility" notice for each — pure benign noise on
// every build. Filter ONLY those messages so the build log stays clean and a real
// warning is never buried. (We keep Vite's externalization behavior unchanged;
// marking node:* `external` would instead emit literal `import "node:fs"` and break
// the engine worker at load.)
const quietLogger = createLogger()
const baseWarn = quietLogger.warn.bind(quietLogger)
quietLogger.warn = (msg, options) => {
  if (typeof msg === 'string' && msg.includes('has been externalized for browser compatibility')) {
    return
  }
  baseWarn(msg, options)
}

// Plugin to generate version.json for cache invalidation. Writes into the
// RESOLVED build outDir (not a hardcoded `dist/`), so a non-default --outDir
// (e.g. the exit-gate's dist-verify) works on a fresh checkout.
function versionPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'version-plugin',
    configResolved(config) {
      outDir = config.build.outDir
    },
    writeBundle() {
      const version = createHash('sha256')
        .update(Date.now().toString())
        .digest('hex')
        .slice(0, 12)

      const versionData = {
        version,
        buildTime: new Date().toISOString(),
      }

      writeFileSync(
        path.resolve(__dirname, outDir, 'version.json'),
        JSON.stringify(versionData)
      )
      console.log(`✅ Generated version.json: ${version}`)
    },
  }
}

// PWA + Service Worker (Workbox via vite-plugin-pwa).
//
// Cache discipline — the whole point of P6:
//   PRECACHE (install)  the small, hashed APP SHELL only: index.html + the
//                       /assets/*.{js,css} chunks (incl. the lazy cities chunk).
//                       NEVER the ~38 MB Pyodide/bundle blobs — that would block
//                       first paint on 38 MB.
//   RUNTIME CacheFirst  the large, immutable engine data on first use:
//                       /pyodide/** (wasm + lock + wheels) and /bundle/chunk(s)
//                       + /bundle/manifest(s) (content-addressed -> immutable).
//   RUNTIME NetworkFirst the update SIGNALS: /bundle/latest, /version.json,
//                       and the webmanifest — short TTL so updates propagate.
//
// registerType 'prompt' (NOT autoUpdate): a new SW waits and the UI offers a
// reload (see useVersionCheck/UpdateBanner). A SKIP_WAITING message provides a
// force path for security updates.
function pwaPlugin(): Plugin[] {
  return VitePWA({
    registerType: 'prompt',
    injectRegister: null, // we register manually in main.tsx (typed, prompt-driven)
    // The 38 MB Pyodide + bundle live under public/ -> copied to dist root.
    // Keep them OUT of the precache manifest; they are runtime-cached below.
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff,woff2,ttf,otf}'],
      globIgnores: [
        'pyodide/**',
        'bundle/**',
        '**/*.map',
        'public.key',
        'planets/**',
        // The self-hosted RAG embedding model + onnxruntime-web wasm (~25 MB).
        // Same discipline as Pyodide: far too large for the app-shell precache;
        // it is runtime-cached (CacheFirst) below and fetched on first chat use,
        // so offline-after-first-use still holds.
        'models/**',
      ],
      // App-shell SPA fallback: an offline navigation to any route serves the
      // precached index.html (then React Router takes over).
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/(pyodide|bundle|models)\//, /^\/version\.json$/],
      // Raise the 2 MiB default so the offline geocoder data (~2 MB cities) and
      // the larger app-shell chunks precache.
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          // Immutable, content-addressed bundle data (chunks + manifests).
          urlPattern: ({ url }) =>
            /^\/bundle\/(chunk|chunks|manifest|manifests)\//.test(url.pathname),
          handler: 'CacheFirst',
          options: {
            cacheName: 'almamesh-bundle-immutable',
            expiration: { maxEntries: 4096, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // Immutable Pyodide dist (wasm + lock + wheels + asm).
          urlPattern: ({ url }) => url.pathname.startsWith('/pyodide/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'almamesh-pyodide-immutable',
            expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // The self-hosted RAG model: MiniLM q8 ONNX + tokenizer/config under
          // /models/Xenova/** and the onnxruntime-web wasm under /models/ort/**.
          // Immutable, same-origin; cached on first chat use so semantic search +
          // RAG memory work offline thereafter (zero egress — never the HF CDN).
          urlPattern: ({ url }) => url.pathname.startsWith('/models/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'almamesh-models-immutable',
            expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
            rangeRequests: true,
          },
        },
        {
          // The pinned verify key — small, same-origin, needed offline to boot.
          urlPattern: ({ url }) => url.pathname === '/public.key',
          handler: 'CacheFirst',
          options: {
            cacheName: 'almamesh-pubkey',
            expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // Update SIGNALS: the version pointer + build version. Fresh-first,
          // but fall back to cache so an offline boot still resolves a pointer.
          urlPattern: ({ url }) =>
            url.pathname === '/bundle/latest' || url.pathname === '/version.json',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'almamesh-signals',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
    includeAssets: [
      'favicon.png',
      'favicon.svg',
      'apple-touch-icon.png',
      'logo.png',
    ],
    manifest: {
      name: 'AlmaMesh — Vedic Astrology',
      short_name: 'AlmaMesh',
      description:
        'Compute authentic Vedic (sidereal) astrology charts entirely on your device. No account, works offline.',
      theme_color: '#0D0D1A',
      background_color: '#0D0D1A',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/pwa-maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    devOptions: {
      // Keep the SW OUT of `vite dev` (module-worker engine + SW interact badly
      // in dev); the SW is exercised in the production build / preview / e2e.
      enabled: false,
    },
  }) as Plugin[]
}

// https://vite.dev/config/
export default defineConfig({
  customLogger: quietLogger,
  plugins: [react(), versionPlugin(), ...pwaPlugin()],
  // Pyodide must NOT be pre-bundled: optimizeDeps rewrites the worker entry and
  // breaks `new Worker(new URL('./chartWorker.ts', import.meta.url))` resolution.
  optimizeDeps: {
    // Pyodide: pre-bundling rewrites the worker entry and breaks the engine
    // worker's `new Worker(new URL(...))` resolution (see above).
    // @huggingface/transformers: heavy, worker-only RAG model runtime that
    // dynamic-imports onnxruntime-web wasm; excluding it keeps the dep optimizer
    // from choking on its wasm assets and from rewriting the embedder worker URL.
    exclude: ['pyodide', '@huggingface/transformers'],
  },
  // The engine's workers are ES modules (`{ type: 'module' }`) and import Pyodide
  // (code-split), so workers must emit ESM — the default `iife` cannot code-split.
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@almamesh/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@almamesh/constants': path.resolve(__dirname, '../../packages/constants/src'),
      '@almamesh/store': path.resolve(__dirname, '../../packages/store/src'),
      '@almamesh/llm': path.resolve(__dirname, '../../packages/llm/src'),
      '@almamesh/memory': path.resolve(__dirname, '../../packages/memory/src'),
      // `/types` must precede the bare alias so the more specific one wins.
      '@almamesh/browser/types': path.resolve(__dirname, '../../packages/browser/src/types'),
      '@almamesh/browser': path.resolve(__dirname, '../../packages/browser/src'),
      // Transitive `@edgeproc/browser/*` imports (the edge-proc sync tier) resolve
      // through the workspace: it is vendored at packages/edgeproc-browser and its
      // package.json `exports` map points at TS source, which Vite compiles.
    },
  },
  server: {
    port: 3000,
    allowedHosts: ['host.docker.internal', 'localhost', '127.0.0.1'],
    // Allow serving workspace files above apps/web (packages/*, incl. the
    // vendored packages/edgeproc-browser sync Worker entry) in dev. (No effect
    // on the production build / preview.)
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The largest legitimate lazy chunks are intentional and code-split, so the
    // 500 kB default warning is pure noise: the offline geocoder city DB
    // (~2 MB, loaded only in onboarding's location search) and the React/vendor
    // entry chunk (~1 MB, gzip ~300 kB). Neither blocks first paint. Set the
    // limit just above them so a genuinely oversized NEW chunk still trips it.
    // (We deliberately do NOT hand-group chunks: an explicit regex grouping of
    // the React ecosystem crashed the app with `React.createContext` of
    // undefined under bun's hoisted node_modules layout, so we let Rollup's
    // default code-splitting order React correctly.)
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      output: {
        // Include content hash in filenames for cache invalidation
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})
