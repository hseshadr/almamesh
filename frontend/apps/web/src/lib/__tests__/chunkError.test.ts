import { describe, it, expect } from 'vitest';

import { isChunkLoadError } from '../chunkError';

describe('isChunkLoadError', () => {
  it('matches the Chromium dynamic-import failure', () => {
    const err = new Error(
      'Failed to fetch dynamically imported module: https://almamesh.com/assets/Dashboard-abc.js',
    );
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('matches the Firefox "error loading dynamically imported module"', () => {
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('matches the Safari "Importing a module script failed"', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('matches a webpack-style ChunkLoadError by name', () => {
    const err = new Error('Loading chunk 5 failed.');
    err.name = 'ChunkLoadError';
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('does NOT match an unrelated runtime error', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('is null/undefined/non-error safe', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({ nope: true })).toBe(false);
  });

  it('accepts a raw string message', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true);
    expect(isChunkLoadError('just a string')).toBe(false);
  });
});
