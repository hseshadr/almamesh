import { describe, expect, it } from 'vitest'
import { createBuildIdentity, normalizeBuildCommit } from './buildIdentity'

const SHA = 'A'.repeat(40)
const BUILD_TIME = '2026-07-16T00:00:00.000Z'

describe('build identity', () => {
  it('normalizes a full CI SHA and preserves the immutable identity', () => {
    expect(createBuildIdentity(SHA, '0.4.0', BUILD_TIME)).toEqual({
      commit: SHA.toLowerCase(),
      version: '0.4.0',
      buildTime: BUILD_TIME,
    })
  })

  it('uses an explicit local marker when no CI SHA is supplied', () => {
    expect(normalizeBuildCommit(undefined)).toBe('local')
  })

  it('rejects shortened or malformed commit identities', () => {
    expect(() => normalizeBuildCommit('abc1234')).toThrow(/full 40-character/)
  })
})
