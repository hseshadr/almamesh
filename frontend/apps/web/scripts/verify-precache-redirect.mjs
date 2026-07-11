#!/usr/bin/env node
/**
 * Precache-vs-Cloudflare-redirect regression gate.
 *
 * The bug this guards (shipped once, CI-green): the Workbox precache manifest
 * listed the prerendered shells as `index.html` / `welcome.html` / … . Cloudflare
 * Pages 308-redirects every `.html` path to its extensionless canonical URL (the
 * SEO behaviour from spec 064). Workbox precache-installs by FETCHING each entry,
 * so a redirecting precache key left returning users with an active service
 * worker but an EMPTY app-shell precache — `navigateFallback` then served nothing
 * and navigations hit a Chrome error page.
 *
 * Why the existing gates missed it: `verify-exit-gate.mjs` / `verify-prerender-
 * dist.mjs` run against `vite preview`, which serves `.html` as 200 — it never
 * reproduces Cloudflare's `.html`→extensionless 308. This gate does: it serves
 * the built `dist/` through a static server that mimics Cloudflare Pages' clean-
 * URL redirects, then fetches EVERY precache URL from `dist/sw.js` and asserts
 * each resolves 200 with NO redirect. A precache entry that 3xx-redirects fails
 * the gate — exactly the original defect.
 *
 * No browser needed — pure HTTP, fast and deterministic.
 *
 * Run (after a production build):
 *   cd frontend/apps/web && bun run build
 *   node scripts/verify-precache-redirect.mjs
 */

import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'

// Accept an optional dist dir (CI builds to `dist-verify`); default to `dist`.
const DIST = resolve(process.argv[2] ?? join(process.cwd(), 'dist'))

// Cloudflare Pages clean-URL map: the prerendered shells are reachable at their
// extensionless canonical URL (200); the `.html` form 308-redirects to it.
const CANONICAL = {
  '/index.html': '/',
  '/welcome.html': '/welcome',
  '/privacy.html': '/privacy',
  '/terms.html': '/terms',
  '/data-deletion.html': '/data-deletion',
}
// The reverse: an extensionless canonical URL is served by the matching flat file.
const CANON_TO_FILE = {
  '/': 'index.html',
  '/welcome': 'welcome.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
  '/data-deletion': 'data-deletion.html',
}

const MIME = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

/** A static server that mimics Cloudflare Pages clean-URL redirects over dist/. */
function cloudflareLikeServer() {
  return createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)

    // 1. `.html` shells 308-redirect to their canonical URL (as CF Pages does).
    if (CANONICAL[pathname]) {
      res.writeHead(308, { location: CANONICAL[pathname] })
      return res.end()
    }
    // 2. Extensionless canonical URLs serve the matching flat prerendered file.
    const canonFile = CANON_TO_FILE[pathname]
    const rel = canonFile ?? pathname.replace(/^\//, '')
    const filePath = join(DIST, rel)
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
      return res.end(readFileSync(filePath))
    }
    // 3. Everything else 404s (a real missing precache asset must NOT be masked).
    res.writeHead(404)
    res.end('not found')
  })
}

/** Pull the precache URLs out of the generated sw.js manifest. */
function readPrecacheUrls() {
  const sw = readFileSync(join(DIST, 'sw.js'), 'utf-8')
  return [...sw.matchAll(/["'`]([^"'`]+?)["'`]\s*,\s*revision/g)]
    .map((m) => m[1])
    .map((u) => (u.startsWith('/') ? u : `/${u}`))
}

async function main() {
  if (!existsSync(join(DIST, 'sw.js'))) {
    console.error('FATAL: dist/sw.js not found — run `bun run build` first.')
    process.exit(1)
  }

  const urls = readPrecacheUrls()
  if (urls.length === 0) {
    console.error('FATAL: no precache URLs found in dist/sw.js.')
    process.exit(1)
  }

  const server = cloudflareLikeServer()
  await new Promise((r) => server.listen(0, r))
  const base = `http://localhost:${server.address().port}`

  const failures = []
  let redirected = 0
  for (const url of urls) {
    // Fetch exactly what the Workbox SW install does — WITHOUT following redirects,
    // so a 3xx (the bug) is caught instead of silently followed.
    const res = await fetch(base + url, { redirect: 'manual' }).catch((e) => ({ status: 0, error: String(e) }))
    if (res.status >= 300 && res.status < 400) {
      redirected += 1
      failures.push(`REDIRECT ${res.status}: precache entry ${url} -> ${res.headers?.get?.('location') ?? '?'} (Workbox install would fail — precache under a CF-redirecting key)`)
    } else if (res.status !== 200) {
      failures.push(`STATUS ${res.status}${res.error ? ` (${res.error})` : ''}: precache entry ${url} not served`)
    }
  }

  // Positive assertion: the canonical shell fallback `/` must be precached.
  if (!urls.includes('/')) {
    failures.push('precache manifest is MISSING the canonical shell "/" (navigateFallback target)')
  }
  // Negative assertion: no redirecting `.html` shell may be precached.
  const leaked = urls.filter((u) => CANONICAL[u])
  for (const u of leaked) {
    failures.push(`precache entry ${u} is a CF-redirecting .html shell (should be its canonical URL ${CANONICAL[u]})`)
  }

  await new Promise((r) => server.close(r))

  console.log('='.repeat(64))
  console.log(`Precache-redirect gate: checked ${urls.length} precache URLs against a Cloudflare-like server`)
  if (failures.length) {
    for (const f of failures) console.log(`  [FAIL] ${f}`)
    console.log(`\n❌ ${failures.length} precache entr${failures.length === 1 ? 'y' : 'ies'} would break a fresh SW install on Cloudflare Pages (${redirected} redirecting).`)
    process.exit(1)
  }
  console.log(`  [PASS] every precache URL resolves 200 with no redirect on a CF-like server`)
  console.log(`  [PASS] canonical shell "/" precached; no redirecting .html shells in the manifest`)
  console.log('\n✅ precache is robust to Cloudflare Pages clean-URL redirects.')
  process.exit(0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
