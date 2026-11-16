/**
 * Network-Aware Centralized Data Layer & Query Cache
 *
 * Implements:
 * 1. In-flight request deduplication (Single Flight).
 * 2. Shared query caching with configurable TTL.
 * 3. Stale-While-Revalidate (SWR) support for fast UI responsiveness.
 * 4. Exponential backoff retry with randomized jitter.
 * 5. Request timeout and cancellation via AbortController.
 * 6. Defensive Network Information API enhancement (slow-network sensing).
 * 7. Duplicate mutation protection.
 */

export interface CacheOptions {
  /** Freshness lifetime in milliseconds (default: 30,000 ms) */
  ttlMs?: number;
  /** If true, return cached data immediately even if stale, while updating in background */
  staleWhileRevalidate?: boolean;
  /** Number of retry attempts on network failures (default: 2) */
  retries?: number;
  /** Timeout in milliseconds before rejecting with a timeout error (default: 15,000 ms) */
  timeoutMs?: number;
  /** Force network fetch, bypassing memory cache */
  forceRefresh?: boolean;
  /** Priority level for request scheduling */
  priority?: 'high' | 'normal' | 'low';
}

export interface NetworkStatusInfo {
  isOnline: boolean;
  isSlow: boolean;
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
  saveData: boolean;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

// Memory cache storage
const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const inFlightMutations = new Set<string>();

/**
 * Defensively inspect network conditions via Network Information API.
 * Never throws. Defaults to standard online state if unsupported (Safari, Firefox, etc.).
 */
export function getNetworkStatus(): NetworkStatusInfo {
  if (typeof window === 'undefined') {
    return { isOnline: true, isSlow: false, effectiveType: 'unknown', saveData: false };
  }

  const isOnline = navigator.onLine !== false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navConn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!navConn) {
    return { isOnline, isSlow: false, effectiveType: 'unknown', saveData: false };
  }

  const effectiveType = (navConn.effectiveType || 'unknown').toLowerCase();
  const saveData = Boolean(navConn.saveData);
  const isSlow = !isOnline || effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g' || saveData;

  return { isOnline, isSlow, effectiveType, saveData };
}

/**
 * Execute a network fetch with exponential backoff and jitter.
 */
async function executeWithRetry<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  retries: number,
  timeoutMs: number,
): Promise<T> {
  let attempt = 0;
  const baseDelay = 300;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await fetcher(controller.signal);
      clearTimeout(timer);
      return result;
    } catch (err: unknown) {
      clearTimeout(timer);
      attempt++;

      // If user aborted or reached retry limit, throw
      if (attempt > retries) {
        throw err;
      }

      // Check if online before retrying
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw err;
      }

      // Exponential backoff with randomized jitter
      const jitter = Math.random() * 200;
      const delay = Math.min(3000, baseDelay * Math.pow(2, attempt - 1) + jitter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export const dataCache = {
  /**
   * Fetch data with in-flight deduplication, caching, and optional Stale-While-Revalidate.
   */
  async fetch<T>(
    key: string,
    fetcher: (signal?: AbortSignal) => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    const {
      ttlMs = 30_000,
      staleWhileRevalidate = true,
      retries = 2,
      timeoutMs = 15_000,
      forceRefresh = false,
    } = options;

    const now = Date.now();
    const existing = cache.get(key) as CacheEntry<T> | undefined;

    // 1. Fresh cache hit: return immediately
    if (!forceRefresh && existing && now - existing.timestamp < existing.ttlMs) {
      return existing.data;
    }

    // 2. In-flight request deduplication: join active promise
    if (inFlight.has(key)) {
      return inFlight.get(key) as Promise<T>;
    }

    // 3. Stale-While-Revalidate: return stale data immediately, trigger background refresh
    if (!forceRefresh && existing && staleWhileRevalidate) {
      // Trigger background update without blocking
      this.refresh(key, fetcher, { ttlMs, retries, timeoutMs }).catch(() => undefined);
      return existing.data;
    }

    // 4. Dispatch fresh request
    return this.refresh(key, fetcher, { ttlMs, retries, timeoutMs });
  },

  /**
   * Internal execution to fetch fresh data and update cache.
   */
  async refresh<T>(
    key: string,
    fetcher: (signal?: AbortSignal) => Promise<T>,
    options: Pick<CacheOptions, 'ttlMs' | 'retries' | 'timeoutMs'> = {},
  ): Promise<T> {
    const { ttlMs = 30_000, retries = 2, timeoutMs = 15_000 } = options;

    // Join active in-flight request if one exists
    if (inFlight.has(key)) {
      return inFlight.get(key) as Promise<T>;
    }

    const promise = (async () => {
      try {
        const data = await executeWithRetry(fetcher, retries, timeoutMs);
        cache.set(key, { data, timestamp: Date.now(), ttlMs });
        return data;
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, promise as Promise<unknown>);
    return promise;
  },

  /**
   * Read from cache synchronously (returns null if absent or stale).
   */
  get<T>(key: string, allowStale = false): T | null {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (!allowStale && Date.now() - entry.timestamp >= entry.ttlMs) {
      return null;
    }
    return entry.data;
  },

  /**
   * Manually prime or update the cache.
   */
  set<T>(key: string, data: T, ttlMs = 30_000): void {
    cache.set(key, { data, timestamp: Date.now(), ttlMs });
  },

  /**
   * Invalidate cache entries matching a string key or regex pattern.
   */
  invalidate(pattern: string | RegExp): void {
    if (typeof pattern === 'string') {
      cache.delete(pattern);
      return;
    }
    for (const k of cache.keys()) {
      if (pattern.test(k)) {
        cache.delete(k);
      }
    }
  },

  /**
   * Clear all cached data (used on sign out).
   */
  clear(): void {
    cache.clear();
    inFlight.clear();
    inFlightMutations.clear();
  },

  /**
   * Guard against duplicate concurrent mutations (e.g. double clicking submit button).
   * Throws an error or returns false if mutation is already in-flight.
   */
  async runMutation<T>(mutationKey: string, action: () => Promise<T>): Promise<T> {
    if (inFlightMutations.has(mutationKey)) {
      throw new Error('A request is already in progress. Please wait a moment.');
    }

    inFlightMutations.add(mutationKey);
    try {
      return await action();
    } finally {
      // Small cooldown to prevent immediate accidental re-submission
      setTimeout(() => inFlightMutations.delete(mutationKey), 400);
    }
  },
};
