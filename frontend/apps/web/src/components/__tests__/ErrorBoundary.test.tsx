import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import '../../i18n/config';
import { ErrorBoundary } from '../ErrorBoundary';

/** A child that throws on render so the boundary trips into its fallback. */
function Boom(): never {
  throw new Error('stale-state boom');
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs the caught error itself; silence the noise but keep the spy so
    // we can assert OUR componentDidCatch logging fired with the real error.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  });

  it('renders the fallback with a reset-app-data escape hatch when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    // The bulletproof escape hatch for a stranded returning visitor.
    expect(screen.getByRole('button', { name: /reset app data/i })).toBeTruthy();
    // The existing recovery actions remain.
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /refresh page/i })).toBeTruthy();
  });

  it('logs the real underlying error (never hides the cause behind a blank fallback)', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    const loggedOurError = consoleError.mock.calls.some((args: unknown[]) =>
      args.some((a) => a instanceof Error && a.message === 'stale-state boom'),
    );
    expect(loggedOurError).toBe(true);
  });

  it('reset handler clears every stale-state source best-effort, then reloads', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations } });

    const cacheKeys = vi.fn().mockResolvedValue(['a', 'b']);
    const cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: cacheKeys, delete: cacheDelete });

    const lsClear = vi.fn();
    vi.stubGlobal('localStorage', {
      clear: lsClear,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      length: 0,
    });

    const idbDatabases = vi.fn().mockResolvedValue([{ name: 'almamesh-x' }]);
    const idbDeleteDatabase = vi.fn().mockReturnValue({});
    vi.stubGlobal('indexedDB', {
      databases: idbDatabases,
      deleteDatabase: idbDeleteDatabase,
    });

    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /reset app data/i }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(unregister).toHaveBeenCalled();
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(lsClear).toHaveBeenCalled();
    expect(idbDeleteDatabase).toHaveBeenCalledWith('almamesh-x');
  });

  it('still reloads even when one cleanup path throws (best-effort, isolated)', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockRejectedValue(new Error('SW boom')),
      },
    });
    vi.stubGlobal('caches', {
      keys: vi.fn().mockRejectedValue(new Error('caches boom')),
      delete: vi.fn(),
    });
    const lsClear = vi.fn(() => {
      throw new Error('ls boom');
    });
    vi.stubGlobal('localStorage', {
      clear: lsClear,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      length: 0,
    });
    vi.stubGlobal('indexedDB', undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /reset app data/i }));

    // One failing path must not block the others or the final reload.
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
