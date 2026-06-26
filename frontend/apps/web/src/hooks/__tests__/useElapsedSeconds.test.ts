import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatElapsed, useElapsedSeconds } from '../useElapsedSeconds';

describe('formatElapsed', () => {
  it('formats seconds as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(5)).toBe('0:05');
    expect(formatElapsed(65)).toBe('1:05');
    expect(formatElapsed(95)).toBe('1:35');
    expect(formatElapsed(600)).toBe('10:00');
  });
});

describe('useElapsedSeconds', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts up once per second while active', () => {
    const { result } = renderHook(() => useElapsedSeconds(true));
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(3);
  });

  it('stays at 0 when inactive', () => {
    const { result } = renderHook(() => useElapsedSeconds(false));
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
  });

  it('resets when toggled off', () => {
    const { result, rerender } = renderHook(({ active }) => useElapsedSeconds(active), {
      initialProps: { active: true },
    });
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(2);
    rerender({ active: false });
    expect(result.current).toBe(0);
  });
});
