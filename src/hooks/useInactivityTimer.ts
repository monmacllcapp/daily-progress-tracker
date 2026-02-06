import { useRef, useEffect, useCallback } from 'react';

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

export function useInactivityTimer(
  isActive: boolean,
  onInactive: () => void,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): { resetTimer: () => void } {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFiredRef = useRef(false);
  const callbackRef = useRef(onInactive);
  callbackRef.current = onInactive;

  const clearExisting = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearExisting();
    if (hasFiredRef.current) return;
    timeoutRef.current = setTimeout(() => {
      hasFiredRef.current = true;
      callbackRef.current();
    }, timeoutMs);
  }, [clearExisting, timeoutMs]);

  const resetTimer = useCallback(() => {
    hasFiredRef.current = false;
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    if (isActive) {
      startTimer();
    } else {
      clearExisting();
    }
    return clearExisting;
  }, [isActive, startTimer, clearExisting]);

  return { resetTimer };
}
