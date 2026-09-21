import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "@/app/api/recommend/route";
import { clearFplCache } from "@/lib/fpl/fetchers";

function upstreamData() {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    code: 100 + index,
    name: `Team ${index + 1}`,
    short_name: `T${index + 1}`,
    strength: 3,
    strength_overall_home: 1200,
    strength_overall_away: 1200,
    strength_attack_home: 1200,
    strength_attack_away: 1200,
    strength_defence_home: 1200,
    strength_defence_away: 1200,
  }));
  const positions = [
    ...Array(3).fill(1),
    ...Array(8).fill(2),
    ...Array(8).fill(3),
    ...Array(5).fill(4),
  ];
  const elements = positions.map((elementType, index) => ({
    id: index + 1,
    code: 10_000 + index,
    web_name: `P${index + 1}`,
    first_name: "Player",
    second_name: String(index + 1),
    team: index % 8 + 1,
    team_code: 100 + index % 8,
    element_type: elementType,
    now_cost: 45,
    total_points: 30 + index,
    form: String(2 + index % 6),
    points_per_game: String(2 + index % 5),
    selected_by_percent: "5",
    status: "a",
    ep_next: "5",
    ict_index: "60",
    minutes: 900,
    starts: 10,
  }));
  const events = [
    { id: 1, finished: true, deadline_time: "2025-08-01T10:00:00Z" },
    { id: 2, finished: true, deadline_time: "2025-08-08T10:00:00Z" },
    { id: 3, is_next: true, finished: false, deadline_time: "2027-08-15T10:00:00Z" },
  ];
  const fixtures = [1, 3, 5, 7].map((teamH, index) => ({
    id: index + 1,
    event: 3,
    team_h: teamH,
    team_a: teamH + 1,
    team_h_difficulty: 2,
    team_a_difficulty: 3,
    finished: false,
  }));
  return { bootstrap: { teams, elements, events }, fixtures };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function mockFpl(options: { fixtureFailure?: boolean; malformedBootstrap?: boolean; team?: boolean } = {}) {
  const data = upstreamData();
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/bootstrap-static/")) return json(options.malformedBootstrap ? { elements: [{}], teams: [] } : data.bootstrap);
    if (url.includes("/fixtures/")) return options.fixtureFailure ? json({ error: true }, 503) : json(data.fixtures);
    if (url.endsWith("/entry/123/")) return json({ id: 123, name: "Test team", current_event: 2 });
    if (url.includes("/entry/123/history/")) return json({ current: [] });
    if (url.includes("/event/2/picks/")) return json({ detail: "not found" }, 404);
    if (url.includes("/event/1/picks/")) return json({
      event: 1,
      picks: Array.from({ length: 15 }, (_, index) => ({
        element: index + 1,
        position: index + 1,
        multiplier: index === 0 ? 2 : 1,
        is_captain: index === 0,
        is_vice_captain: index === 1,
      })),
      entry_history: { bank: 10, value: 990, event_transfers: 1 },
    });
    return json({ detail: "not found" }, 404);
  }) as typeof fetch;
}

test("generic route returns compact response schema v2 and captain-inclusive total", async () => {
  await clearFplCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFpl();
  try {
    const response = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: "{}" }));
    const text = await response.text();
    const payload = JSON.parse(text);
    assert.equal(response.status, 200);
    assert.equal(payload.data.schemaVersion, 2);
    assert.equal(payload.data.recommendation.squad.length, 15);
    assert.equal(payload.data.recommendation.startingXIIds.length, 11);
    assert.equal(payload.data.recommendation.benchIds.length, 4);
    assert.equal(payload.data.scoring.fivePlusMetric.featureParity, "production-replay");
    assert.equal(payload.data.scoring.fivePlusMetric.availabilityTreatment, "reported-separately");
    assert.equal(payload.data.scoring.fivePlusMetric.doubleGameweekEvidence, "limited-sample");
    assert.equal("startingXI" in payload.data.recommendation, false);
    const byId = new Map<number, { id: number; projectedPoints: number }>(payload.data.recommendation.squad.map((player: { id: number; projectedPoints: number }) => [player.id, player]));
    const projectedPoints = (id: number) => {
      const item = byId.get(id);
      assert.ok(item);
      return item.projectedPoints;
    };
    const xiTotal = payload.data.recommendation.startingXIIds.reduce((sum: number, id: number) => sum + projectedPoints(id), 0);
    assert.equal(payload.data.recommendation.projectedTotal, Number((xiTotal + projectedPoints(payload.data.recommendation.captainId)).toFixed(1)));
    assert.ok(Buffer.byteLength(text) < 50_000);
  } finally {
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});

test("Team ID route falls back through picks-specific 404s", async () => {
  await clearFplCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFpl({ team: true });
  try {
    const response = await POST(new Request("http://localhost/api/recommend", {
      method: "POST",
      body: JSON.stringify({ teamId: 123 }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.userTeam.picksEvent, 1);
    assert.equal(payload.data.userTeam.picksAvailable, true);
  } finally {
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});

test("fixture failure and malformed upstream schemas return typed errors", async () => {
  const originalFetch = globalThis.fetch;
  try {
    await clearFplCache();
    globalThis.fetch = mockFpl({ fixtureFailure: true });
    const fixtureResponse = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: "{}" }));
    assert.equal(fixtureResponse.status, 502);
    assert.equal((await fixtureResponse.json()).error.code, "FIXTURE_DATA_UNAVAILABLE");

    await clearFplCache();
    globalThis.fetch = mockFpl({ malformedBootstrap: true });
    const schemaResponse = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: "{}" }));
    assert.equal(schemaResponse.status, 502);
    assert.equal((await schemaResponse.json()).error.code, "UPSTREAM_SCHEMA_ERROR");
  } finally {
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});

test("malformed and oversized requests are rejected before upstream access", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return json({});
  }) as typeof fetch;
  try {
    for (const body of ["{", "[]", "null", JSON.stringify({ teamId: "123" }), JSON.stringify({ extra: true })]) {
      const malformed = await POST(new Request("http://localhost/api/recommend", { method: "POST", body }));
      assert.equal(malformed.status, 400);
      assert.equal((await malformed.json()).error.code, "VALIDATION_ERROR");
    }
    const oversized = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify({ padding: "x".repeat(2_000) }) }));
    assert.equal(oversized.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("season completion, rate limits, and invalid fixture payloads are typed", async () => {
  const originalFetch = globalThis.fetch;
  try {
    await clearFplCache();
    const data = upstreamData();
    globalThis.fetch = (async (input) => String(input).includes("/bootstrap-static/")
      ? json({ ...data.bootstrap, events: [{ id: 1, finished: true }] })
      : json(data.fixtures)) as typeof fetch;
    const complete = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: "{}" }));
    assert.equal(complete.status, 409);
    assert.equal((await complete.json()).error.code, "SEASON_COMPLETE");

    await clearFplCache();
    globalThis.fetch = (async (input) => String(input).includes("/bootstrap-static/")
      ? json({}, 429)
      : json(data.fixtures)) as typeof fetch;
    const limited = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: "{}" }));
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, "RATE_LIMITED");

    await clearFplCache();
    globalThis.fetch = (async (input) => String(input).includes("/bootstrap-static/")
      ? json(data.bootstrap)
      : json([])) as typeof fetch;
    const invalidFixtures = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: "{}" }));
    assert.equal(invalidFixtures.status, 502);
    assert.equal((await invalidFixtures.json()).error.code, "FIXTURE_DATA_UNAVAILABLE");
  } finally {
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});

test("Team ID history and picks failures degrade without changing the scoring path", async () => {
  await clearFplCache();
  const originalFetch = globalThis.fetch;
  const base = mockFpl();
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("/entry/123/history/") || url.includes("/event/2/picks/")) return json({}, 503);
    return base(input, init);
  }) as typeof fetch;
  try {
    const response = await POST(new Request("http://localhost/api/recommend", {
      method: "POST",
      body: JSON.stringify({ teamId: 123 }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.userTeam.dataStatus, "partial");
    assert.equal(payload.data.userTeam.picksAvailable, false);
    assert.equal(payload.data.recommendation.squad.length, 15);
  } finally {
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});

test("Team ID upstream outages are not mislabeled as invalid user input", async () => {
  await clearFplCache();
  const originalFetch = globalThis.fetch;
  const base = mockFpl();
  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith("/entry/123/")) return json({}, 503);
    return base(input, init);
  }) as typeof fetch;
  try {
    const response = await POST(new Request("http://localhost/api/recommend", {
      method: "POST",
      body: JSON.stringify({ teamId: 123 }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.equal(payload.error.code, "UPSTREAM_ERROR");
  } finally {
    globalThis.fetch = originalFetch;
    await clearFplCache();
  }
});
