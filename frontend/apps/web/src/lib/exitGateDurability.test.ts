import { describe, expect, it } from 'vitest'
import { isActivePointerName } from '../../scripts/exitGateDurability.mjs'

describe('exit-gate OPFS durability probe', () => {
  it('recognizes both crash-safe active slots and the legacy slot', () => {
    expect(isActivePointerName('active.a')).toBe(true)
    expect(isActivePointerName('active.b')).toBe(true)
    expect(isActivePointerName('active')).toBe(true)
  })

  it('does not treat unrelated OPFS entries as an active pointer', () => {
    expect(isActivePointerName('chunk')).toBe(false)
    expect(isActivePointerName('active.tmp')).toBe(false)
  })
})
