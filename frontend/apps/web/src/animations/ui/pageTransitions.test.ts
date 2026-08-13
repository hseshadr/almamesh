import { describe, expect, it } from 'vitest';

import { pageVariants } from './pageTransitions';

describe('pageVariants', () => {
  it('never translates an app page beyond the mobile viewport', () => {
    expect(pageVariants.initial).not.toHaveProperty('x');
    expect(pageVariants.animate).not.toHaveProperty('x');
    expect(pageVariants.exit).not.toHaveProperty('x');
  });
});
