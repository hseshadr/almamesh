import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChartEngine } from '@almamesh/browser';
import type { LocalBirthInput } from '@almamesh/store';

import { useLagnaPreview } from './useLagnaPreview';

function validInput(): LocalBirthInput {
  return {
    date: '1990-03-30',
    time: '12:00',
    latitude: 12.97,
    longitude: 77.59,
    timezone: 'Asia/Kolkata',
  };
}

function makeEngine() {
  const generateChart = vi.fn().mockResolvedValue({
    lagna: {
      sign: 'Aquarius',
      sign_degrees: 3.5,
      nakshatra: 'Dhanishta',
    },
  });
  return {
    engine: { generateChart } as unknown as ChartEngine,
    generateChart,
  };
}

describe('useLagnaPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not regenerate lagna for a new object with the same value key', async () => {
    const { engine, generateChart } = makeEngine();
    const initialInput = validInput();
    const { rerender } = renderHook(
      ({ input }: { input: LocalBirthInput }) => useLagnaPreview(engine, null, input),
      { initialProps: { input: initialInput } },
    );

    act(() => vi.advanceTimersByTime(300));
    await waitFor(() => expect(generateChart).toHaveBeenCalledTimes(1));

    rerender({ input: { ...initialInput } });
    act(() => vi.advanceTimersByTime(300));

    expect(generateChart).toHaveBeenCalledTimes(1);
  });
});
