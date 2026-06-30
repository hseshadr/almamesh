/**
 * EngineWarming — the honest, recoverable "engine not ready" surface for the
 * rectification wizard's fit step.
 *
 * Invariants tested:
 *  - Plain warming (no error, not timed out) shows reassurance, NO reset button
 *  - The current boot stage is surfaced as an honest sub-label while warming
 *  - An engine boot ERROR shows a failure message + a reset-and-reload button
 *  - A warming TIMEOUT (no error) shows a stalled message + a reset button
 *  - The reset button always invokes onRetry (the engine-recovery invariant)
 */
import '../../../i18n/config';

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { EngineWarming } from './EngineWarming';

describe('EngineWarming', () => {
  it('plain warming shows the warming title and NO reset button', () => {
    render(
      <EngineWarming engineError={null} timedOut={false} engineStage={null} onRetry={vi.fn()} />,
    );
    expect(screen.getByText('Warming up the chart engine')).toBeTruthy();
    expect(screen.queryByTestId('engine-reset-btn')).toBeNull();
  });

  it('surfaces the current boot stage as a sub-label while warming', () => {
    render(
      <EngineWarming
        engineError={null}
        timedOut={false}
        engineStage="syncing"
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText('Downloading the engine bundle…')).toBeTruthy();
  });

  it('an engine error shows the failure title + detail and a reset button that retries', () => {
    const onRetry = vi.fn();
    render(
      <EngineWarming
        engineError="OPFS quota exceeded"
        timedOut={false}
        engineStage={null}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("The chart engine couldn't start")).toBeTruthy();
    expect(screen.getByText('OPFS quota exceeded')).toBeTruthy();
    fireEvent.click(screen.getByTestId('engine-reset-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a warming timeout (no error) shows the stalled message + a reset button', () => {
    const onRetry = vi.fn();
    render(
      <EngineWarming engineError={null} timedOut={true} engineStage={null} onRetry={onRetry} />,
    );
    expect(screen.getByText('This is taking longer than usual')).toBeTruthy();
    fireEvent.click(screen.getByTestId('engine-reset-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
