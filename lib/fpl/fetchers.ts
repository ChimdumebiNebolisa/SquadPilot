const FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const BOOTSTRAP_TTL_MS = 1000 * 60 * 15;
const FIXTURES_TTL_MS = 1000 * 60 * 5;
const MAX_RETRIES = 3;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const inMemoryCache = new Map<string, CacheEntry>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getCached<T>(key: string): T | null {
  const entry = inMemoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    inMemoryCache.delete(key);
    return null;
  }

  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  inMemoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export class FplHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchFplJson<T>(path: string): Promise<T> {
  let lastStatus = 500;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(`${FPL_BASE_URL}${path}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    lastStatus = response.status;

    if (response.status !== 429 || attempt === MAX_RETRIES) {
      break;
    }

    const backoffMs = 300 * Math.pow(2, attempt);
    await delay(backoffMs);
  }

  throw new FplHttpError(lastStatus, `FPL request failed for ${path}`);
}

export async function fetchBootstrapStatic(): Promise<unknown> {
  const cacheKey = "bootstrap-static";
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return cached;
  }

  const value = await fetchFplJson<unknown>("/bootstrap-static/");
  setCached(cacheKey, value, BOOTSTRAP_TTL_MS);
  return value;
}

export async function fetchFixturesForEvent(eventId: number): Promise<unknown> {
  const cacheKey = `fixtures-${eventId}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    return cached;
  }

  const value = await fetchFplJson<unknown>(`/fixtures/?event=${eventId}`);
  setCached(cacheKey, value, FIXTURES_TTL_MS);
  return value;
}
