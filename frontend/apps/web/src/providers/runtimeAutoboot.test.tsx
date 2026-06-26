import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import type { BootStage, ChartEngine, OnStage, RuntimeConfig } from '@almamesh/browser'
import { AlmaMeshRuntimeProvider } from './AlmaMeshRuntimeProvider'
import { useChartEngine } from './chartEngineContext'

// hasLocalChart is the synchronous "does a saved chart exist?" probe the gate
// consults. Mock it so we can drive the landing-vs-app decision deterministically.
vi.mock('../lib/localChart', () => ({
  hasLocalChart: vi.fn(() => false),
}))
import { hasLocalChart } from '../lib/localChart'

/**
 * Minimal `AlmaMeshRuntime` stand-in (mirrors the existing provider test): each
 * `bootstrap()` resolves a ready engine and bumps a call counter so the test can
 * assert whether the mount auto-boot fired.
 */
interface FakeRuntime {
  bootstrap(config: RuntimeConfig, onStage?: OnStage): Promise<ChartEngine>
  bootstrapCalls: number
}

function makeFakeEngine(): ChartEngine {
  return {
    generateChart: vi.fn(),
    computePredictive: vi.fn(),
    computeMeshEdge: vi.fn(),
    meta: () => ({
      bundle_id: 'test',
      version: '0',
      engine_version: '0',
      ephemeris_file: 'de421.bsp',
      ayanamsa: 'lahiri',
      constructs: [],
    }),
  } as unknown as ChartEngine
}

function makeFakeRuntime(): FakeRuntime {
  return {
    bootstrapCalls: 0,
    bootstrap(_config: RuntimeConfig, onStage: OnStage = () => {}) {
      this.bootstrapCalls += 1
      onStage({ kind: 'ready' } as BootStage)
      return Promise.resolve(makeFakeEngine())
    },
  }
}

/** Surfaces whether the context exposes startBootstrap, for the contract assertion. */
function Probe() {
  const value = useChartEngine()
  return (
    <span data-testid="startBootstrap">
      {typeof value.startBootstrap === 'function' ? 'has-startBootstrap' : 'no-startBootstrap'}
    </span>
  )
}

/** Set the initial location the provider reads at mount (it sits above the router). */
function setPath(pathname: string) {
  window.history.pushState({}, '', pathname)
}

describe('AlmaMeshRuntimeProvider — auto-boot gating', () => {
  beforeEach(() => {
    vi.mocked(hasLocalChart).mockReturnValue(false)
    setPath('/')
  })

  afterEach(() => {
    vi.clearAllMocks()
    setPath('/')
  })

  it('does NOT auto-boot on the landing route (path "/" with no saved chart)', async () => {
    vi.mocked(hasLocalChart).mockReturnValue(false)
    setPath('/')
    const runtime = makeFakeRuntime()

    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <Probe />
      </AlmaMeshRuntimeProvider>,
    )

    // Give any (incorrect) async mount effect a chance to fire.
    await Promise.resolve()
    await Promise.resolve()
    expect(runtime.bootstrapCalls).toBe(0)
  })

  it('DOES auto-boot on an engine route (e.g. "/onboarding")', async () => {
    vi.mocked(hasLocalChart).mockReturnValue(false)
    setPath('/onboarding')
    const runtime = makeFakeRuntime()

    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <Probe />
      </AlmaMeshRuntimeProvider>,
    )

    await waitFor(() => expect(runtime.bootstrapCalls).toBe(1))
  })

  it('DOES auto-boot on "/" when a chart already exists (returning visitor)', async () => {
    vi.mocked(hasLocalChart).mockReturnValue(true)
    setPath('/')
    const runtime = makeFakeRuntime()

    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <Probe />
      </AlmaMeshRuntimeProvider>,
    )

    await waitFor(() => expect(runtime.bootstrapCalls).toBe(1))
  })

  it('exposes an idempotent startBootstrap() on the context', () => {
    setPath('/')
    const runtime = makeFakeRuntime()

    render(
      <AlmaMeshRuntimeProvider runtime={runtime}>
        <Probe />
      </AlmaMeshRuntimeProvider>,
    )

    expect(screen.getByTestId('startBootstrap').textContent).toBe('has-startBootstrap')
  })
})
