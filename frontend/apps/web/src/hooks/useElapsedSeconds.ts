import { useEffect, useRef, useState } from 'react';

/**
 * Seconds elapsed since `active` last transitioned to `true`; resets to 0 when
 * inactive. Lets the UI show an HONEST, live "time so far" instead of a fixed
 * (and usually wrong) estimate like "about 30 seconds".
 */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setSeconds(0);
      return;
    }
    startRef.current = Date.now();
    setSeconds(0);
    const id = setInterval(() => {
      if (startRef.current != null) {
        setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

/** Format a duration in seconds as `m:ss` (e.g. 95 → "1:35", 5 → "0:05"). */
export function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
