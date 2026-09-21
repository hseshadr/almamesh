#!/usr/bin/env node
/**
 * Real-browser proof for production semantic memory.
 *
 * Requires a production build created with VITE_EXIT_GATE_HOOKS=1 and served
 * by Vite preview. A browser with working OPFS opens the shipped SQLite +
 * sqlite-vector Worker, writes, queries, closes, reopens, and queries the same
 * durable index again. A browser engine whose OPFS entrypoint refuses instead
 * proves the stable fail-closed path: no Worker and no storage fallback.
 */

import { chromium, webkit } from '@playwright/test'

const arguments_ = process.argv.slice(2)
const BASE_URL = arguments_.find((argument) => !argument.startsWith('--')) ?? 'http://127.0.0.1:4199'
const requestedBrowser = arguments_
  .find((argument) => argument.startsWith('--browser='))
  ?.slice('--browser='.length) ?? 'chromium'
const ORIGIN = new URL(BASE_URL).origin
const EXPECTED_MESSAGE = 'sqlite-proof-message'

async function runBrowser(browserType, browserName) {
  const browser = await browserType.launch({ headless: true })
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage()
    const pageErrors = []
    const requests = []
    const workers = []

    page.on('pageerror', (error) => pageErrors.push(String(error)))
    page.on('request', (request) => requests.push(request.url()))
    page.on('worker', (worker) => workers.push(worker.url()))

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => typeof window.__almameshVerifySqliteMemory === 'function',
      undefined,
      { timeout: 20_000 },
    )

    const capability = await page.evaluate(async () => {
      try {
        await navigator.storage.getDirectory()
        return { opfs: 'available' }
      } catch (error) {
        return {
          opfs: 'unavailable',
          errorName: error instanceof Error ? error.name : 'Error',
          errorMessage: error instanceof Error ? error.message : String(error),
          userAgent: navigator.userAgent,
        }
      }
    })
    const workerStart = workers.length
    const requestStart = requests.length
    let proof = null
    let proofError = null
    try {
      proof = await page.evaluate(() => window.__almameshVerifySqliteMemory())
    } catch (error) {
      proofError = String(error)
    }
    const proofWorkers = workers.slice(workerStart)
    const uniqueWorkerAssets = [...new Set(proofWorkers)]
    const proofRequests = requests.slice(requestStart)
    const offOrigin = proofRequests.filter((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return false
      return new URL(url).origin !== ORIGIN
    })

    const assertions = capability.opfs === 'available'
      ? {
          firstQuery: proof?.firstMessageId === EXPECTED_MESSAGE,
          reopenedQuery: proof?.reopenedMessageId === EXPECTED_MESSAGE,
          sqliteRuntime: /^3\./.test(proof?.sqliteVersion ?? ''),
          sqliteVectorRuntime: /^1\./.test(proof?.vectorVersion ?? ''),
          twoWorkerLifecycles: proofWorkers.length === 2,
          oneEmittedWorkerAsset: uniqueWorkerAssets.length === 1,
          zeroThirdPartyEgress: offOrigin.length === 0,
          noPageErrors: pageErrors.length === 0,
        }
      : {
          stableFailClosedError: proofError?.includes(
            'Semantic memory requires a working Origin Private File System',
          ) === true,
          noFallbackWorker: proofWorkers.length === 0,
          zeroThirdPartyEgress: offOrigin.length === 0,
          noPageErrors: pageErrors.length === 0,
        }
    const failures = Object.entries(assertions)
      .filter(([, passed]) => !passed)
      .map(([name]) => name)

    const result = {
      browser: browserName,
      passed: failures.length === 0,
      capability,
      proof,
      proofError,
      assertions,
      workers: proofWorkers,
      requests: proofRequests,
      offOrigin,
      pageErrors,
    }
    if (failures.length > 0) {
      throw new Error(`${browserName} SQLite memory proof failed: ${failures.join(', ')}`)
    }
    return result
  } finally {
    await browser.close()
  }
}

const browserTypes = { chromium, webkit }
const browserType = browserTypes[requestedBrowser]
if (browserType === undefined) {
  throw new Error(`Unsupported browser: ${requestedBrowser}`)
}
const result = await runBrowser(browserType, requestedBrowser)
console.log(JSON.stringify(result, null, 2))
