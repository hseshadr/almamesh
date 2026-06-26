import { describe, expect, it } from 'vitest';

import { cuspInfo, degreesToNearestCusp } from '../lagnaCusp';

// --- degreesToNearestCusp ---------------------------------------------------
describe('degreesToNearestCusp', () => {
  it('is the distance to the lower boundary near the start of a sign', () => {
    expect(degreesToNearestCusp(0)).toBe(0);
    expect(degreesToNearestCusp(1.2)).toBeCloseTo(1.2, 6);
  });

  it('is the distance to the upper boundary near the end of a sign', () => {
    expect(degreesToNearestCusp(29.9)).toBeCloseTo(0.1, 6);
    expect(degreesToNearestCusp(27)).toBe(3);
  });

  it('is maximal (15) at the exact middle of a sign', () => {
    expect(degreesToNearestCusp(15)).toBe(15);
  });
});

// --- cuspInfo ---------------------------------------------------------------
describe('cuspInfo', () => {
  it('flags the PREVIOUS sign at the lower boundary (0°)', () => {
    const info = cuspInfo('Taurus', 0);
    expect(info).not.toBeNull();
    expect(info?.neighbourSign).toBe('Aries');
    expect(info?.degrees).toBe(0);
  });

  it('flags the previous sign just inside the threshold (3°)', () => {
    const info = cuspInfo('Taurus', 3);
    expect(info).not.toBeNull();
    expect(info?.neighbourSign).toBe('Aries');
    expect(info?.degrees).toBe(3);
  });

  it('returns null in the middle of a sign (15°)', () => {
    expect(cuspInfo('Taurus', 15)).toBeNull();
  });

  it('flags the NEXT sign near the upper boundary (27°)', () => {
    const info = cuspInfo('Aquarius', 27);
    expect(info).not.toBeNull();
    expect(info?.neighbourSign).toBe('Pisces');
    expect(info?.degrees).toBe(3);
  });

  it('flags the next sign very close to the upper boundary (29.9°)', () => {
    const info = cuspInfo('Aquarius', 29.9);
    expect(info).not.toBeNull();
    expect(info?.neighbourSign).toBe('Pisces');
    expect(info?.degrees).toBeCloseTo(0.1, 6);
  });

  it('the reference-native case: Leo 0.04° is ~0.04° from the Cancer cusp', () => {
    const info = cuspInfo('Leo', 0.04);
    expect(info?.neighbourSign).toBe('Cancer');
    expect(info?.degrees).toBeCloseTo(0.04, 6);
  });

  it('wraps Aries↔Pisces at the lower boundary (Aries 0° → Pisces)', () => {
    const info = cuspInfo('Aries', 0.5);
    expect(info?.neighbourSign).toBe('Pisces');
    expect(info?.degrees).toBeCloseTo(0.5, 6);
  });

  it('wraps Pisces↔Aries at the upper boundary (Pisces 29.5° → Aries)', () => {
    const info = cuspInfo('Pisces', 29.5);
    expect(info?.neighbourSign).toBe('Aries');
    expect(info?.degrees).toBeCloseTo(0.5, 6);
  });

  it('accepts a custom threshold', () => {
    expect(cuspInfo('Taurus', 4, 3)).toBeNull();
    expect(cuspInfo('Taurus', 4, 5)?.neighbourSign).toBe('Aries');
  });

  it('returns null for an unknown sign name rather than throwing', () => {
    expect(cuspInfo('NotASign', 1)).toBeNull();
  });
});
