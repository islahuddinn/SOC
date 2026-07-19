import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePollingOptions {
  intervalMs?: number;
  enabled?: boolean;
}

export function usePolling<T>(
  fetcher: () => Promise<T>,
  options: UsePollingOptions = {}
) {
  const { intervalMs = 3000, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcher();
      if (!mountedRef.current) return;
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(id);
  }, [refresh, intervalMs, enabled]);

  return { data, error, loading, lastUpdated, refresh };
}

export function usePollUntilComplete(
  fetcher: () => Promise<{ status: string }>,
  isComplete: (status: string) => boolean,
  intervalMs = 2000
) {
  const [data, setData] = useState<{ status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let timer: number | undefined;

    async function poll() {
      try {
        const result = await fetcher();
        if (!mountedRef.current) return;
        setData(result);
        if (!isComplete(result.status)) {
          timer = window.setTimeout(poll, intervalMs);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Polling failed');
      }
    }

    poll();
    return () => {
      mountedRef.current = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [fetcher, isComplete, intervalMs]);

  return { data, error };
}
