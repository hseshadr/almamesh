import { describe, it, expect } from 'vitest'
import { buildEnergyFrame, activeDashaFromChart } from '@almamesh/store'

import { DEMO_CHART } from './demoChart'

describe('DEMO_CHART', () => {
  it('drives the energy frame with no engine', () => {
    const frame = buildEnergyFrame(DEMO_CHART, 0)
    expect(frame).toBeTruthy()
    // A complete frame carries all 9 planet waves — proves the fixture is valid.
    expect(frame.planets).toHaveLength(9)
  })

  it('resolves the active dasha lords with no engine', () => {
    const active = activeDashaFromChart(DEMO_CHART)
    expect(active.maha).toBeTruthy()
  })
})
