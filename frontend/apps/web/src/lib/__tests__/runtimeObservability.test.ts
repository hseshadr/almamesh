import { describe, expect, it } from 'vitest'
import { publishRuntimeError, publishRuntimeStage } from '../runtimeObservability'

describe('runtime observability', () => {
  it('publishes typed stage and error values for browser gates', () => {
    publishRuntimeStage('ready')
    publishRuntimeError('signature failed')

    expect(window.__ALMAMESH_STAGE__).toBe('ready')
    expect(window.__ALMAMESH_ERROR__).toBe('signature failed')
  })
})
