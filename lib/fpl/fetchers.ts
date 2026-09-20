const FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const BOOTSTRAP_TTL_MS = 1000 * 60 * 15;
const FIXTURES_TTL_MS = 1000 * 60 * 5;
const DETAIL_TTL_MS = 1000 * 60 * 15;
const MAX_RETRIES = 3;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  fetchedAt: string;
}

const inMemoryCache = new Map<string, CacheEntry>();
let lastSuccessfulSync: string | null = null;
let lastAttemptedSync: string | null = null;
let lastError: string | null = null;
let lastResponseWasStale = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCached<T>(key: string, allowExpired = false): CacheEntry & { value: T } | null {
  const entry = inMemoryCache.get(key);
  if (!entry) return null;
  if (!allowExpired && Date.now() >= entry.expiresAt) {
    return null;
  }
  return entry as CacheEntry & { value: T };
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  const fetchedAt = new Date().toISOString();
  inMemoryCache.set(key, { value, expiresAt: Date.now() + ttlMs, fetchedAt });
  lastSuccessfulSync = fetchedAt;
  lastError = null;
  lastResponseWasStale = false;
}

export class FplHttpError extends Error {
  status: number;
  stale: boolean;

  constructor(status: number, message: string, stale = false) {
    super(message);
    this.status = status;
    this.stale = stale;
  }
}

async function fetchFplJson<T>(path: string, ttlMs: number, cacheKey = path): Promise<T> {
  const fresh = getCached<T>(cacheKey);
  if (fresh) return fresh.value;

  lastAttemptedSync = new Date().toISOString();
  let lastStatus = 500;
  let lastMessage = `FPL request failed for ${path}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(`${FPL_BASE_URL}${path}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        const value = (await response.json()) as T;
        setCached(cacheKey, value, ttlMs);
        return value;
      }
      lastStatus = response.status;
      lastMessage = `FPL request failed for ${path} (${response.status})`;
      if (response.status !== 429 || attempt === MAX_RETRIES) break;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : lastMessage;
      if (attempt === MAX_RETRIES) break;
    }

    await delay(300 * Math.pow(2, attempt));
  }

  const stale = getCached<T>(cacheKey, true);
  if (stale) {
    lastError = lastMessage;
    lastResponseWasStale = true;
    return stale.value;
  }

  lastError = lastMessage;
  throw new FplHttpError(lastStatus, lastMessage);
}

export function getFplSyncStatus() {
  return {
    lastSuccessfulSync,
    lastAttemptedSync,
    lastError,
    stale: lastResponseWasStale,
  };
}

export function clearFplCache(): void {
  inMemoryCache.clear();
  lastSuccessfulSync = null;
  lastAttemptedSync = null;
  lastError = null;
  lastResponseWasStale = false;
}

export async function fetchBootstrapStatic(): Promise<unknown> {
  return fetchFplJson("/bootstrap-static/", BOOTSTRAP_TTL_MS, "bootstrap-static");
}

/** Fetch the full fixture set once so double gameweeks and postponed matches are visible. */
export async function fetchFixtures(): Promise<unknown> {
  return fetchFplJson("/fixtures/", FIXTURES_TTL_MS, "fixtures-all");
}

/** Kept for callers that need the old API; filtering happens after the cached full response. */
export async function fetchFixturesForEvent(eventId: number): Promise<unknown> {
  const raw = await fetchFixtures();
  return Array.isArray(raw)
    ? raw.filter((fixture) => typeof fixture === "object" && fixture !== null && (fixture as { event?: unknown }).event === eventId)
    : [];
}

export async function fetchElementSummary(elementId: number): Promise<unknown> {
  return fetchFplJson(`/element-summary/${elementId}/`, DETAIL_TTL_MS, `element-summary-${elementId}`);
}

export async function fetchEntry(teamId: number): Promise<unknown> {
  return fetchFplJson(`/entry/${teamId}/`, DETAIL_TTL_MS, `entry-${teamId}`);
}

export async function fetchEntryHistory(teamId: number): Promise<unknown> {
  return fetchFplJson(`/entry/${teamId}/history/`, DETAIL_TTL_MS, `entry-history-${teamId}`);
}

export async function fetchEntryPicks(teamId: number, eventId: number): Promise<unknown> {
  return fetchFplJson(`/entry/${teamId}/event/${eventId}/picks/`, DETAIL_TTL_MS, `entry-picks-${teamId}-${eventId}`);
}
