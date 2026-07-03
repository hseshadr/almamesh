/**
 * Vitest setup file for React testing
 */
import '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia. Guarded: a few suites (e.g. the Spec 064 prerender
// canary) run under `@vitest-environment node`, where no `window` exists —
// exactly the environment the build-time prerender executes in.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
