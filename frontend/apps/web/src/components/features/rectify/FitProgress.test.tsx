/**
 * FitProgress — honest indeterminate progress indicator for the rectification
 * fit step.
 *
 * Invariants tested:
 *  - Renders the progress container and timer element
 *  - Timer starts at 0 and increments each second
 *  - Device-note copy is present
 *  - NEVER a "%" character anywhere in the output (no fake progress bar)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

import '../../../i18n/config';
import { FitProgress } from './FitProgress';

describe('FitProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the progress container', () => {
    render(<FitProgress />);
    expect(screen.getByTestId('fit-progress')).toBeTruthy();
  });

  it('renders an elapsed timer element', () => {
    render(<FitProgress />);
    expect(screen.getByTestId('fit-elapsed')).toBeTruthy();
  });

  it('timer starts at 0s on mount', () => {
    render(<FitProgress />);
    // The elapsed element shows the 0-second mark initially
    const elapsed = screen.getByTestId('fit-elapsed');
    expect(elapsed.textContent).toContain('0');
  });

  it('timer increments to 3s after 3 seconds', () => {
    render(<FitProgress />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const elapsed = screen.getByTestId('fit-elapsed');
    expect(elapsed.textContent).toContain('3');
  });

  it('renders the device note explaining on-device computation', () => {
    render(<FitProgress />);
    expect(screen.getByTestId('fit-device-note')).toBeTruthy();
  });

  it('contains NO "%" character anywhere in the rendered output', () => {
    const { container } = render(<FitProgress />);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(container.textContent).not.toContain('%');
  });

  it('surfaces a retry affordance once the spinner stalls past the threshold', () => {
    const onRetry = vi.fn();
    render(<FitProgress onRetry={onRetry} />);

    // Below the stall threshold: no retry yet (sub-second compute is normal).
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId('fit-retry')).toBeNull();

    // Past the threshold: a bounded fallback appears so it can't spin forever.
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    const retry = screen.getByTestId('fit-retry');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('never shows a retry affordance when no onRetry is provided', () => {
    render(<FitProgress />);
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.queryByTestId('fit-retry')).toBeNull();
  });
});
