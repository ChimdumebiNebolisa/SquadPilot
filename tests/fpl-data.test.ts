import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFplElementSummary, normalizeVaastavRows, lookupOpponentHistory } from "@/lib/historical/normalize";
import { getHistoricalAvailability } from "@/lib/historical/store";
import { recordsAvailableBefore, recentPointsBefore } from "@/lib/historical/backtest";
import { getFixturesForTeamAndEvent } from "@/lib/fpl/fixtures";
import { normalizeFixtures, resolveGameweeksPlayed, resolveNextGameweek } from "@/lib/fpl/normalize";
import { computeStartEstimate } from "@/lib/scoring/chance-of-starting";
import type { NormalizedPlayer } from "@/lib/fpl/types";

function player(overrides: Partial<NormalizedPlayer> = {}): NormalizedPlayer {
  return {
    source: { source: "fpl-live", season: "current", gameweek: null, fixtureId: null, asOf: "2026-01-01T00:00:00.000Z", confidence: "high", availability: "available" },
    id: 1, webName: "Test", firstName: "", lastName: "", teamId: 1, position: "MID", price: 6,
    totalPoints: 100, form: 5, pointsPerGame: 5, selectedByPercent: 10, status: "a", news: "",
    chanceOfPlayingNextRound: null, epNext: 5, ictIndex: 100, minutesPlayedSeason: 900, starts: 2,
    goals: 0, assists: 0, expectedGoals: null, expectedAssists: null,
    cornersAndIndirectFreeKicksOrder: null, directFreeKicksOrder: null, penaltiesOrder: null,
    ...overrides,
  };
}

test("aggregates every fixture in a double gameweek and preserves home/away", () => {
  const fixtures = normalizeFixtures([
    { id: 1, event: 20, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: null, finished: false },
    { id: 2, event: 20, team_h: 3, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 2, kickoff_time: null, finished: false },
  ], "2026-01-01T00:00:00.000Z");
  const summary = getFixturesForTeamAndEvent(1, 20, fixtures);
  assert.equal(summary.fixtureCount, 2);
  assert.equal(summary.homeCount, 1);
  assert.equal(summary.awayCount, 1);
  assert.deepEqual(summary.fixtures.map((fixture) => fixture.opponentTeamId), [2, 3]);
});

test("provisionally finished matches count as played and next gameweek skips them", () => {
  assert.equal(resolveGameweeksPlayed({ events: [{ id: 1, finished: true }, { id: 2, finished: false, finished_provisional: true }, { id: 3, finished: false }] }), 2);
  assert.equal(resolveNextGameweek({ events: [{ id: 1, finished: true }, { id: 2, finished: false, finished_provisional: true }, { id: 3, is_next: true, finished: false }] }), 3);
});

test("opponent history shrinks a one-match sample toward the player baseline", () => {
  const dataset = normalizeVaastavRows([
    { element: "1", fixture: "1", round: "1", team: "1", opponent_team: "2", was_home: "1", minutes: "90", starts: "1", total_points: "20" },
    { element: "1", fixture: "2", round: "2", team: "1", opponent_team: "3", was_home: "0", minutes: "90", starts: "1", total_points: "2" },
  ], "2024-25", "2026-01-01T00:00:00.000Z");
  const record = lookupOpponentHistory(dataset, 1, 2, 11);
  assert.ok(record);
  assert.equal(record.sampleSize, 1);
  assert.ok(record.shrunkPointsPer90 < record.pointsPer90);
  assert.equal(lookupOpponentHistory(dataset, 1, 99, 11), null);
});

test("historical joins fall back to player identity with low-confidence provenance", () => {
  const dataset = normalizeVaastavRows([
    { element: "999", name: "Test Player", fixture: "1", round: "1", team: "1", opponent_team: "2", was_home: "1", minutes: "90", starts: "1", total_points: "8" },
  ], "2025-26", "2026-01-01T00:00:00.000Z");
  const record = lookupOpponentHistory(dataset, 1, 2, 5, "Test Player");
  assert.ok(record);
  assert.equal(record.playerId, 1);
  assert.equal(record.source.confidence, "low");
});

test("FPL element summaries retain live provenance and prior-season aggregates", () => {
  const normalized = normalizeFplElementSummary(1, {
    history: [{ round: 1, fixture: 1, opponent_team: 2, was_home: true, minutes: 90, starts: 1, total_points: 6 }],
    history_past: [{ season_name: "2024/25", minutes: 900, starts: 10, total_points: 60 }],
  }, "current", "2026-01-01T00:00:00.000Z");
  assert.equal(normalized.performances[0]?.source.source, "fpl-live");
  assert.equal(normalized.seasonAggregates.some((aggregate) => aggregate.season === "2024/25" && aggregate.pointsPer90 === 6), true);
});

test("versioned historical snapshots are available to the application", () => {
  const availability = getHistoricalAvailability();
  assert.equal(availability.status, "available");
  assert.ok(availability.records > 0);
});

test("start estimate uses starts per actual fixture, not minutes divided by gameweeks", () => {
  const estimate = computeStartEstimate(player({ starts: 2, minutesPlayedSeason: 900 }), { completedTeamFixtures: 20, upcomingFixtureCount: 1 });
  assert.equal(estimate, 10);
  assert.equal(computeStartEstimate(player({ status: "i", chanceOfPlayingNextRound: 0, starts: 20 }), { completedTeamFixtures: 20, upcomingFixtureCount: 1 }), 0);
  assert.ok(computeStartEstimate(player({ starts: 2, minutesPlayedSeason: 900 }), { completedTeamFixtures: 20, upcomingFixtureCount: 2 }) < estimate);
});

test("walk-forward inputs exclude the evaluated gameweek", () => {
  const dataset = normalizeVaastavRows([
    { element: "1", fixture: "1", round: "1", opponent_team: "2", minutes: "90", starts: "1", total_points: "4" },
    { element: "1", fixture: "2", round: "2", opponent_team: "2", minutes: "90", starts: "1", total_points: "15" },
  ], "2024-25", "2026-01-01T00:00:00.000Z");
  const before = recordsAvailableBefore(dataset.performances, 2);
  assert.deepEqual(recentPointsBefore(dataset.performances, 1, 2), [4]);
  assert.equal(before.length, 1);
  assert.equal(before[0]?.totalPoints, 4);
});

test("missing fixture and historical data stays explicitly missing", () => {
  assert.deepEqual(getFixturesForTeamAndEvent(1, 1, []).status, "missing");
  assert.equal(lookupOpponentHistory(null, 1, 2, 5), null);
});
