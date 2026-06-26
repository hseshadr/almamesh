import { describe, expect, it } from 'vitest';

import { canExportPdf } from './exportGate';

describe('canExportPdf', () => {
  it('disables export until a real interpretation has finished generating', () => {
    expect(canExportPdf('idle', false)).toBe(false);
    expect(canExportPdf('generating', false)).toBe(false);
    expect(canExportPdf('generating', true)).toBe(false); // not finished yet
    expect(canExportPdf('error', false)).toBe(false);
    expect(canExportPdf('complete', false)).toBe(false); // no real content
    expect(canExportPdf('complete', true)).toBe(true);
  });
});
