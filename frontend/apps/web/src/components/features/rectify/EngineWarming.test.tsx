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

const clearEngineBundleCache = vi.fn<() => Promise<boolean>>();
vi.mock('../../../lib/resetAppData', () => ({
  clearEngineBundleCache: () => clearEngineBundleCache(),
}));

import { EngineWarming } from './EngineWarming';

describe('EngineWarming', () => {
  it('plain warming shows the warming title and NO reset button', () => {
    render(
      <EngineWarming engineError={null} engineErrorCode={null} timedOut={false} engineStage={null} onRetry={vi.fn()} />,
    );
    expect(screen.getByText('Warming up the chart engine')).toBeTruthy();
    expect(screen.queryByTestId('engine-reset-btn')).toBeNull();
  });

  it('surfaces the current boot stage as a sub-label while warming', () => {
    render(
      <EngineWarming
        engineError={null}
        engineErrorCode={null}
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
        engineErrorCode="storage"
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
      <EngineWarming engineError={null} engineErrorCode={null} timedOut={true} engineStage={null} onRetry={onRetry} />,
    );
    expect(screen.getByText('This is taking longer than usual')).toBeTruthy();
    fireEvent.click(screen.getByTestId('engine-reset-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a non-rollback boot error offers clear-engine-cache & reload directly (explicit click only)', async () => {
    clearEngineBundleCache.mockResolvedValue(true);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <EngineWarming
        engineError="signature verification failed"
        engineErrorCode="integrity"
        timedOut={false}
        engineStage={null}
        onRetry={vi.fn()}
      />,
    );
    expect(clearEngineBundleCache).not.toHaveBeenCalled();
    expect(screen.queryByTestId('rollback-warning')).toBeNull();
    fireEvent.click(screen.getByTestId('engine-clear-cache-btn'));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(clearEngineBundleCache).toHaveBeenCalledTimes(1);
  });

  it('a ROLLBACK refusal warns of possible tampering and needs a two-step confirm before clearing', async () => {
    clearEngineBundleCache.mockResolvedValue(true);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <EngineWarming
        engineError="refusing rollback: sequence is not fresher than the active pointer's"
        engineErrorCode="rollback"
        timedOut={false}
        engineStage={null}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByTestId('rollback-warning').textContent).toMatch(/older version of the engine/);

    // First click only opens the confirm; nothing is cleared.
    fireEvent.click(screen.getByTestId('engine-clear-cache-btn'));
    expect(clearEngineBundleCache).not.toHaveBeenCalled();

    // Cancel backs out without clearing.
    fireEvent.click(screen.getByTestId('rollback-reset-cancel'));
    expect(screen.queryByTestId('rollback-reset-confirm')).toBeNull();
    expect(clearEngineBundleCache).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('engine-clear-cache-btn'));
    fireEvent.click(screen.getByTestId('rollback-reset-confirm'));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(clearEngineBundleCache).toHaveBeenCalledTimes(1);
  });

  it('a mere warming timeout does not offer the cache clear', () => {
    render(
      <EngineWarming engineError={null} engineErrorCode={null} timedOut={true} engineStage={null} onRetry={vi.fn()} />,
    );
    expect(screen.queryByTestId('engine-clear-cache-btn')).toBeNull();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearEngineBundleCache.mockReset();
});
