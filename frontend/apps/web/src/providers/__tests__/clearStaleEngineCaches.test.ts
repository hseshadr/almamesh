import { describe, it, expect, vi, afterEach } from 'vitest'
import { clearStaleEngineCaches } from '../AlmaMeshRuntimeProvider'

// The recovery path's cache cleanup. A stale verify key pinned under
// `almamesh-pubkey` (the old CacheFirst strategy) is the classic cause of a
// fail-closed "signature verification failed"; reboot() must drop it — but must
// NOT nuke the immutable, content-addressed engine caches (a 38 MB re-download).
describe('clearStaleEngineCaches', () => {
  const orig = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  afterEach(() => {
    if (orig) Object.defineProperty(globalThis, 'caches', orig)
    else delete (globalThis as { caches?: unknown }).caches
    vi.restoreAllMocks()
  })

  function stubCaches(impl: (name: string) => Promise<boolean>): string[] {
    const deleted: string[] = []
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        delete: vi.fn((name: string) => {
          deleted.push(name)
          return impl(name)
        }),
      },
    })
    return deleted
  }

  it('deletes the mutable verify-key + signal caches, never the immutable ones', async () => {
    const deleted = stubCaches(() => Promise.resolve(true))
    await clearStaleEngineCaches()
    expect(deleted).toEqual(expect.arrayContaining(['almamesh-pubkey', 'almamesh-signals']))
    expect(deleted).not.toContain('almamesh-bundle-immutable')
    expect(deleted).not.toContain('almamesh-pyodide-immutable')
  })

  it('is a guarded no-op when CacheStorage is unavailable', async () => {
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: undefined })
    await expect(clearStaleEngineCaches()).resolves.toBeUndefined()
  })

  it('swallows cache.delete errors so recovery never hard-fails', async () => {
    stubCaches(() => Promise.reject(new Error('boom')))
    await expect(clearStaleEngineCaches()).resolves.toBeUndefined()
  })
})
