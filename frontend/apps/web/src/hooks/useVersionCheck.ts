import { useEffect, useRef, useCallback, useState } from 'react';

import { applyServiceWorkerUpdate } from '../lib/swUpdate';

interface VersionInfo {
  version: string;
  buildTime: string;
}

interface UseVersionCheckOptions {
  /** Polling interval in milliseconds (default: 5 minutes) */
  pollInterval?: number;
  /** Whether to check on window focus (default: true) */
  checkOnFocus?: boolean;
  /** Callback when new version is detected */
  onNewVersion?: (newVersion: string) => void;
}

/**
 * Hook to detect when a new version of the app is deployed.
 * Polls /version.json and compares with the initial version.
 *
 * Industry standard approach for cache invalidation:
 * - Build generates version.json with unique hash
 * - App polls periodically + on window focus
 * - On mismatch, prompts user to refresh
 */
export function useVersionCheck(options: UseVersionCheckOptions = {}) {
  const {
    pollInterval = 5 * 60 * 1000, // 5 minutes
    checkOnFocus = true,
    onNewVersion,
  } = options;

  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [newVersionInfo, setNewVersionInfo] = useState<VersionInfo | null>(null);
  const initialVersionRef = useRef<string | null>(null);
  const isCheckingRef = useRef(false);

  const checkVersion = useCallback(async () => {
    // Prevent concurrent checks
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      // Add cache-busting query param
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        // version.json doesn't exist (dev mode) - skip check
        return;
      }

      const data: VersionInfo = await response.json();

      // Store initial version on first check
      if (initialVersionRef.current === null) {
        initialVersionRef.current = data.version;
        return;
      }

      // Compare versions
      if (data.version !== initialVersionRef.current) {
        setHasNewVersion(true);
        setNewVersionInfo(data);
        onNewVersion?.(data.version);
      }
    } catch {
      // Silently fail - might be offline or version.json doesn't exist
    } finally {
      isCheckingRef.current = false;
    }
  }, [onNewVersion]);

  // One update path, shared with useServiceWorker. This used to post
  // SKIP_WAITING to `navigator.serviceWorker.controller` — the OLD, active
  // worker, which ignores it — and then plain-reload, which cannot activate a
  // waiting worker either. Both halves left the user on the stale build.
  const refreshApp = useCallback(() => {
    void applyServiceWorkerUpdate();
  }, []);

  const dismissUpdate = useCallback(() => {
    setHasNewVersion(false);
  }, []);

  useEffect(() => {
    // Initial check
    checkVersion();

    // Set up polling
    const intervalId = setInterval(checkVersion, pollInterval);

    // Check on window focus
    const handleFocus = () => {
      if (checkOnFocus) {
        checkVersion();
      }
    };

    // Check when coming back online
    const handleOnline = () => {
      checkVersion();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [checkVersion, pollInterval, checkOnFocus]);

  return {
    hasNewVersion,
    newVersionInfo,
    refreshApp,
    dismissUpdate,
    checkVersion,
  };
}
