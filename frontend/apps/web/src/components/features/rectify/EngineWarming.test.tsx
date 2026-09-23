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
 *  - A boot ERROR (e.g. a RollbackError against the durable floor, which a
 *    reboot cannot fix) also offers an explicit "clear engine cache & reload"
 *    that clears ONLY the signed-bundle cache, then reloads
 */
import '../../../i18n/config';

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const clearEngineBundleCache = vi.fn<() => Promise<void>>();
vi.mock('../../../lib/resetAppData', () => ({
  clearEngineBundleCache: () => clearEngineBundleCache(),
}));

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

  it('a boot error also offers clear-engine-cache & reload (explicit click only)', async () => {
    clearEngineBundleCache.mockResolvedValue(undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <EngineWarming
        engineError="refusing rollback: pointer sequence 1 is below the durable floor"
        timedOut={false}
        engineStage={null}
        onRetry={vi.fn()}
      />,
    );
    expect(clearEngineBundleCache).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('engine-clear-cache-btn'));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(clearEngineBundleCache).toHaveBeenCalledTimes(1);
  });

  it('a mere warming timeout does not offer the cache clear', () => {
    render(
      <EngineWarming engineError={null} timedOut={true} engineStage={null} onRetry={vi.fn()} />,
    );
    expect(screen.queryByTestId('engine-clear-cache-btn')).toBeNull();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearEngineBundleCache.mockReset();
});
