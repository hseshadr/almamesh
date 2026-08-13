#!/usr/bin/env node
/**
 * Required WebKit runtime gate. It boots the production bundle at iPhone 13
 * size, generates a real chart, then reloads while every /bundle request is
 * blocked. The second boot can only succeed from the durable local cache.
 *
 * The static server intentionally omits production CSP: this gate isolates the
 * WebKit storage/runtime boundary. CSP and deployed headers have separate gates.
 */

import { devices, webkit } from '@playwright/test'

const BASE_URL = process.argv[2] ?? 'http://localhost:4200'
const CACHE_DATABASE = 'edgeproc-browser-cache'
const FALLBACK_PARAMETER = 'force-indexeddb-engine-cache'
const BIRTH = {
  datetimeUtc: '1990-01-15T12:00:00.000Z',
  latitude: 28.6139,
  longitude: 77.209,
  referenceDate: '2025-01-01T00:00:00+00:00',
}

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

async function openEngineRoute(page) {
  await page.evaluate(() => {
    window.history.pushState({}, '', `/onboarding${window.location.search}`)
    window.dispatchEvent(new window.PopStateEvent('popstate'))
  })
}

async function waitForEngine(page) {
  await page.waitForFunction(
    () =>
      window.__ALMAMESH_STAGE__ === 'ready' ||
      typeof window.__ALMAMESH_ERROR__ === 'string',
    undefined,
    { timeout: 300_000 },
  )
  return page.evaluate(() => ({
    stage: window.__ALMAMESH_STAGE__ ?? null,
    error: window.__ALMAMESH_ERROR__ ?? null,
    hasGenerator: typeof window.__almameshGenerate === 'function',
  }))
}

async function generateReferenceChart(page) {
  return page.evaluate(async (birth) => {
    const chart = await window.__almameshGenerate(birth)
    return {
      lagna: chart?.lagna?.sign?.toLowerCase() ?? null,
      sun: chart?.planets?.sun?.sign?.toLowerCase() ?? null,
      moon: chart?.planets?.moon?.sign?.toLowerCase() ?? null,
    }
  }, BIRTH)
}

async function storageEvidence(page) {
  return page.evaluate(async () => {
    const databases = (await indexedDB.databases()).flatMap((database) =>
      database.name ? [database.name] : [],
    )
    try {
      if (new URL(window.location.href).searchParams.has('force-indexeddb-engine-cache')) {
        return {
          selectedCache: window.__EDGEPROC_SELECTED_CACHE__ ?? null,
          opfs: 'forced-unavailable',
          databases,
        }
      }
      await navigator.storage?.getDirectory()
      return {
        selectedCache: window.__EDGEPROC_SELECTED_CACHE__ ?? null,
        opfs: navigator.storage ? 'available' : 'unavailable',
        databases,
      }
    } catch (error) {
      return {
        selectedCache: window.__EDGEPROC_SELECTED_CACHE__ ?? null,
        opfs: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        databases,
      }
    }
  })
}

async function main() {
  const browser = await webkit.launch({ headless: true })
  try {
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      serviceWorkers: 'block',
    })
    const page = await context.newPage()

    const forcedFallbackUrl = new URL(BASE_URL)
    forcedFallbackUrl.searchParams.set(FALLBACK_PARAMETER, '1')
    await page.goto(forcedFallbackUrl.href, { waitUntil: 'domcontentloaded' })
    await openEngineRoute(page)
    const cold = await waitForEngine(page)
    invariant(cold.stage === 'ready' && cold.hasGenerator, `WebKit cold boot failed: ${JSON.stringify(cold)}`)

    const storage = await storageEvidence(page)
    invariant(storage.opfs === 'forced-unavailable', `OPFS fallback was not forced: ${JSON.stringify(storage)}`)
    invariant(storage.selectedCache === 'indexeddb', `worker did not select IndexedDB: ${JSON.stringify(storage)}`)
    invariant(
      storage.databases.includes(CACHE_DATABASE),
      `durable IndexedDB fallback was not opened: ${JSON.stringify(storage)}`,
    )
    const firstChart = await generateReferenceChart(page)
    invariant(firstChart.lagna === 'gemini', `unexpected cold chart: ${JSON.stringify(firstChart)}`)

    const blocked = []
    await context.route('**/bundle/**', (route) => {
      const url = route.request().url()
      blocked.push(url)
      return route.abort('failed')
    })
    await page.evaluate(() => window.history.replaceState({}, '', `/${window.location.search}`))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openEngineRoute(page)
    const cached = await waitForEngine(page)
    invariant(cached.stage === 'ready' && cached.hasGenerator, `WebKit cached boot failed: ${JSON.stringify(cached)}`)
    invariant(
      blocked.some((u) => u.includes('/bundle/latest')),
      'cached boot was vacuous: /bundle/latest was not blocked',
    )
    const cachedChart = await generateReferenceChart(page)
    invariant(cachedChart.lagna === 'gemini', `unexpected cached chart: ${JSON.stringify(cachedChart)}`)

    console.log(
      JSON.stringify(
        {
          cold,
          cached,
          storage,
          firstChart,
          cachedChart,
          blockedBundleRequests: blocked.length,
        },
        null,
        2,
      ),
    )
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('WebKit engine gate failed:', error)
  process.exitCode = 1
})
