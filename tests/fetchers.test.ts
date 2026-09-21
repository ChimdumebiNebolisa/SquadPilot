import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateFreshness,
  clearFplCache,
  fetchBootstrapStatic,
  fetchEntry,
  fetchFixtures,
  getTeamCacheSize,
} from "@/lib/fpl/fetchers";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function validBootstrap() {
  return {
    elements: [{
      id: 1,
      code: 101,
      web_name: "Player",
      first_name: "Test",
      second_name: "Player",
      team: 1,
      team_code: 10,
      element_type: 1,
      now_cost: 45,
    }],
    teams: [{ id: 1, code: 10, name: "Team", short_name: "T" }],
    events: [],
  };
}

test("concurrent public cache misses coalesce into one upstream request", async () => {
  await clearFplCache();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return jsonResponse(validBootstrap());
  }) as typeof fetch;
  try {
    const [left, right] = await Promise.all([fetchBootstrapStatic(), fetchBootstrapStatic()]);
    assert.equal(calls, 1);
    assert.deepEqual(left.value, right.value);
  } finally {
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});

test("fresh bootstrap does not conceal stale fixtures", async () => {
  await clearFplCache();
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  let failFixtures = false;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/fixtures/") && failFixtures) throw new Error("fixtures offline");
    return url.includes("/fixtures/")
      ? jsonResponse([{ id: 1, event: 1, team_h: 1, team_a: 2, finished: false }])
      : jsonResponse(validBootstrap());
  }) as typeof fetch;
  try {
    await Promise.all([fetchBootstrapStatic(), fetchFixtures()]);
    now += 3 * 60_000;
    failFixtures = true;
    const [bootstrap, fixtures] = await Promise.all([fetchBootstrapStatic(), fetchFixtures()]);
    const combined = aggregateFreshness({ bootstrap: bootstrap.freshness, fixtures: fixtures.freshness });
    assert.equal(bootstrap.freshness.state, "fresh");
    assert.equal(fixtures.freshness.state, "stale");
    assert.equal(combined.state, "stale");
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});

test("malformed successful public responses cannot replace a valid stale cache entry", async () => {
  await clearFplCache();
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  let malformed = false;
  globalThis.fetch = (async () => malformed
    ? jsonResponse([])
    : jsonResponse([{ id: 1, event: 1, team_h: 1, team_a: 2, finished: false }])) as typeof fetch;
  try {
    const initial = await fetchFixtures();
    now += 3 * 60_000;
    malformed = true;
    const fallback = await fetchFixtures();
    assert.equal(fallback.freshness.state, "stale");
    assert.deepEqual(fallback.value, initial.value);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});

test("team cache is bounded by LRU capacity", async () => {
  await clearFplCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({ id: 1 })) as typeof fetch;
  try {
    await Promise.all(Array.from({ length: 270 }, (_, index) => fetchEntry(index + 1)));
    assert.equal(getTeamCacheSize(), 256);
  } finally {
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});
