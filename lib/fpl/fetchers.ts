import { getCache } from "@vercel/functions";

const FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const REQUEST_TIMEOUT_MS = 8_000;
const TEAM_CACHE_LIMIT = 256;
const TEAM_IN_FLIGHT_LIMIT = 256;
const TEAM_FRESH_MS = 30_000;
const TEAM_MAX_STALE_MS = 2 * 60_000;

interface CacheEnvelope<T> {
  value: T;
  fetchedAt: number;
}

export type FplSource = "bootstrap" | "fixtures" | "team";
export type SourceFreshnessState = "fresh" | "stale";

export interface SourceFreshness {
  source: FplSource;
  state: SourceFreshnessState;
  fetchedAt: string;
  ageSeconds: number;
}

export interface FplFetchResult<T> {
  value: T;
  freshness: SourceFreshness;
}

interface PublicFetchPolicy {
  key: "bootstrap-static-v2" | "fixtures-all-v2";
  path: string;
  source: "bootstrap" | "fixtures";
  freshMs: number;
  maxStaleMs: number;
}

const publicPolicies = {
  bootstrap: {
    key: "bootstrap-static-v2",
    path: "/bootstrap-static/",
    source: "bootstrap",
    freshMs: 5 * 60_000,
    maxStaleMs: 30 * 60_000,
  },
  fixtures: {
    key: "fixtures-all-v2",
    path: "/fixtures/",
    source: "fixtures",
    freshMs: 2 * 60_000,
    maxStaleMs: 15 * 60_000,
  },
} satisfies Record<string, PublicFetchPolicy>;

const runtimeCache = getCache({ namespace: "squadpilot-fpl-v2" });
const teamCache = new Map<string, CacheEnvelope<unknown>>();
const inFlight = new Map<string, Promise<FplFetchResult<unknown>>>();

function freshness(source: FplSource, entry: CacheEnvelope<unknown>, state: SourceFreshnessState): SourceFreshness {
  return {
    source,
    state,
    fetchedAt: new Date(entry.fetchedAt).toISOString(),
    ageSeconds: Math.max(0, Math.floor((Date.now() - entry.fetchedAt) / 1000)),
  };
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export class FplHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly source: FplSource,
  ) {
    super(message);
  }
}

async function requestJson(path: string, source: FplSource): Promise<unknown> {
  let lastError = new FplHttpError(502, `FPL request failed for ${path}.`, source);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${FPL_BASE_URL}${path}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return await response.json();
      lastError = new FplHttpError(response.status, `FPL request failed for ${path} (${response.status}).`, source);
      if (!isTransientStatus(response.status)) throw lastError;
    } catch (error) {
      if (error instanceof FplHttpError && !isTransientStatus(error.status)) throw error;
      lastError = error instanceof FplHttpError
        ? error
        : new FplHttpError(504, error instanceof Error ? error.message : `FPL request timed out for ${path}.`, source);
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw lastError;
}

function isCacheEnvelope(value: unknown): value is CacheEnvelope<unknown> {
  return typeof value === "object" && value !== null
    && "fetchedAt" in value && typeof value.fetchedAt === "number"
    && "value" in value;
}

async function publicData<T>(policy: PublicFetchPolicy): Promise<FplFetchResult<T>> {
  const current = await runtimeCache.get(policy.key).catch(() => null);
  const cached = isCacheEnvelope(current) ? current as CacheEnvelope<T> : null;
  if (cached && Date.now() - cached.fetchedAt <= policy.freshMs) {
    return { value: cached.value, freshness: freshness(policy.source, cached, "fresh") };
  }

  const existing = inFlight.get(policy.key);
  if (existing) return existing as Promise<FplFetchResult<T>>;

  const pending = (async (): Promise<FplFetchResult<T>> => {
    try {
      const value = await requestJson(policy.path, policy.source) as T;
      const entry: CacheEnvelope<T> = { value, fetchedAt: Date.now() };
      await runtimeCache.set(policy.key, entry, {
        name: policy.source,
        tags: ["fpl-public-data", policy.source],
        ttl: Math.ceil(policy.maxStaleMs / 1000),
      }).catch(() => undefined);
      return { value, freshness: freshness(policy.source, entry, "fresh") };
    } catch (error) {
      if (cached && Date.now() - cached.fetchedAt <= policy.maxStaleMs) {
        return { value: cached.value, freshness: freshness(policy.source, cached, "stale") };
      }
      throw error;
    } finally {
      inFlight.delete(policy.key);
    }
  })();
  inFlight.set(policy.key, pending as Promise<FplFetchResult<unknown>>);
  return pending;
}

function getTeamCache<T>(key: string): CacheEnvelope<T> | null {
  const entry = teamCache.get(key) as CacheEnvelope<T> | undefined;
  if (!entry) return null;
  teamCache.delete(key);
  teamCache.set(key, entry);
  return entry;
}

function setTeamCache<T>(key: string, entry: CacheEnvelope<T>): void {
  teamCache.delete(key);
  teamCache.set(key, entry);
  while (teamCache.size > TEAM_CACHE_LIMIT) {
    const oldest = teamCache.keys().next().value as string | undefined;
    if (!oldest) break;
    teamCache.delete(oldest);
  }
}

async function teamData<T>(path: string, key: string): Promise<FplFetchResult<T>> {
  const cached = getTeamCache<T>(key);
  if (cached && Date.now() - cached.fetchedAt <= TEAM_FRESH_MS) {
    return { value: cached.value, freshness: freshness("team", cached, "fresh") };
  }
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<FplFetchResult<T>>;

  const pending = (async (): Promise<FplFetchResult<T>> => {
    try {
      const value = await requestJson(path, "team") as T;
      const entry: CacheEnvelope<T> = { value, fetchedAt: Date.now() };
      setTeamCache(key, entry);
      return { value, freshness: freshness("team", entry, "fresh") };
    } catch (error) {
      if (error instanceof FplHttpError && isTransientStatus(error.status)
        && cached && Date.now() - cached.fetchedAt <= TEAM_MAX_STALE_MS) {
        return { value: cached.value, freshness: freshness("team", cached, "stale") };
      }
      throw error;
    } finally {
      inFlight.delete(key);
    }
  })();
  const teamInFlightCount = [...inFlight.keys()].filter((inFlightKey) => inFlightKey.startsWith("entry-")).length;
  if (teamInFlightCount < TEAM_IN_FLIGHT_LIMIT) {
    inFlight.set(key, pending as Promise<FplFetchResult<unknown>>);
  }
  return pending;
}

export async function fetchBootstrapStatic(): Promise<FplFetchResult<unknown>> {
  return publicData(publicPolicies.bootstrap);
}

export async function fetchFixtures(): Promise<FplFetchResult<unknown>> {
  return publicData(publicPolicies.fixtures);
}

export async function fetchEntry(teamId: number): Promise<FplFetchResult<unknown>> {
  return teamData(`/entry/${teamId}/`, `entry-${teamId}`);
}

export async function fetchEntryHistory(teamId: number): Promise<FplFetchResult<unknown>> {
  return teamData(`/entry/${teamId}/history/`, `entry-history-${teamId}`);
}

export async function fetchEntryPicks(teamId: number, eventId: number): Promise<FplFetchResult<unknown>> {
  return teamData(`/entry/${teamId}/event/${eventId}/picks/`, `entry-picks-${teamId}-${eventId}`);
}

export function aggregateFreshness(
  sources: Record<string, SourceFreshness | undefined>,
): { state: "fresh" | "stale" | "degraded"; sources: Record<string, SourceFreshness | undefined> } {
  const values = Object.values(sources).filter((value): value is SourceFreshness => value != null);
  return {
    state: values.some((value) => value.state === "stale") ? "stale" : "fresh",
    sources,
  };
}

export async function clearFplCache(): Promise<void> {
  teamCache.clear();
  inFlight.clear();
  await Promise.all(Object.values(publicPolicies).map((policy) => runtimeCache.delete(policy.key).catch(() => undefined)));
}

export function getTeamCacheSize(): number {
  return teamCache.size;
}
