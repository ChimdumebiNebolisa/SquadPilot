import assert from "node:assert/strict";
import { test } from "node:test";
import { recordsAvailableBefore, recentPointsBefore } from "@/lib/historical/backtest";
import {
  indexHistoricalDataset,
  lookupOpponentHistory,
  lookupOpponentHistoryForSeason,
  normalizeVaastavRows,
  seasonAggregate,
} from "@/lib/historical/normalize";
import { getHistoricalAvailability } from "@/lib/historical/store";
import { getFixturesForTeamAndEvent } from "@/lib/fpl/fixtures";
import {
  FplSchemaError,
  normalizeBootstrap,
  normalizeFixtures,
  resolveGameweeksPlayed,
  resolveNextGameweek,
  resolvePicksEventCandidates,
} from "@/lib/fpl/normalize";
import type { NormalizedPlayer, NormalizedTeam } from "@/lib/fpl/types";
import { computeStartEstimate } from "@/lib/scoring/chance-of-starting";
import { scorePlayers } from "@/lib/scoring/score";

const source = { source: "fpl-live" as const, season: "current", gameweek: null, fixtureId: null, asOf: "2026-01-01T00:00:00.000Z", confidence: "high" as const, availability: "available" as const };

function player(overrides: Partial<NormalizedPlayer> = {}): NormalizedPlayer {
  return {
    source,
    id: 1,
    code: 101,
    webName: "Test",
    firstName: "Test",
    lastName: "Player",
    teamId: 1,
    teamCode: 10,
    position: "MID",
    price: 6,
    totalPoints: 100,
    form: 5,
    pointsPerGame: 5,
    selectedByPercent: 10,
    status: "a",
    news: "",
    chanceOfPlayingNextRound: null,
    epNext: 5,
    ictIndex: 100,
    minutesPlayedSeason: 900,
    starts: 2,
    goals: 0,
    assists: 0,
    expectedGoals: null,
    expectedAssists: null,
    cornersAndIndirectFreeKicksOrder: null,
    directFreeKicksOrder: null,
    penaltiesOrder: null,
    ...overrides,
  };
}

function team(id: number, code: number): NormalizedTeam {
  return {
    source,
    id,
    code,
    name: `Team ${id}`,
    shortName: `T${id}`,
    strength: 3,
    strengthOverallHome: 1200,
    strengthOverallAway: 1200,
    strengthAttackHome: 1200,
    strengthAttackAway: 1200,
    strengthDefenceHome: 1200,
    strengthDefenceAway: 1200,
  };
}

test("double gameweeks aggregate every fixture and stable opponent code", () => {
  const fixtures = normalizeFixtures([
    { id: 1, event: 20, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, finished: false },
    { id: 2, event: 20, team_h: 3, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 2, finished: false },
  ]);
  const summary = getFixturesForTeamAndEvent(1, 20, fixtures, [team(1, 10), team(2, 20), team(3, 30)]);
  assert.equal(summary.fixtureCount, 2);
  assert.equal(summary.homeCount, 1);
  assert.equal(summary.awayCount, 1);
  assert.deepEqual(summary.fixtures.map((fixture) => fixture.opponentTeamCode), [20, 30]);
});

test("provisionally finished matches count and picks use latest deadline-passed event", () => {
  const events = {
    events: [
      { id: 1, finished: true, deadline_time: "2025-08-01T10:00:00Z" },
      { id: 2, finished_provisional: true, deadline_time: "2025-08-08T10:00:00Z" },
      { id: 3, is_next: true, finished: false, deadline_time: "2027-08-15T10:00:00Z" },
    ],
  };
  assert.equal(resolveGameweeksPlayed(events), 2);
  assert.equal(resolveNextGameweek(events), 3);
  assert.deepEqual(resolvePicksEventCandidates(events, Date.parse("2026-01-01T00:00:00Z")), [2, 1]);
});

test("reused source element IDs cannot cross-match stable player codes", () => {
  const dataset = normalizeVaastavRows([
    { element: 7, player_code: 1001, name: "Original", fixture: 1, round: 1, team_code: 10, opponent_team_code: 20, minutes: 90, starts: 1, total_points: 10 },
    { element: 7, player_code: 2002, name: "Different", fixture: 2, round: 2, team_code: 30, opponent_team_code: 20, minutes: 90, starts: 1, total_points: 2 },
  ], "2024-25", "2026-01-01T00:00:00Z");
  assert.equal(lookupOpponentHistory(dataset, 1001, 20, 5)?.totalPoints, 10);
  assert.equal(lookupOpponentHistory(dataset, 2002, 20, 5)?.totalPoints, 2);
  assert.equal(dataset.seasonAggregates.length, 2);
});

test("renamed players with the same stable code retain their history", () => {
  const dataset = normalizeVaastavRows([
    { element: 8, player_code: 3003, name: "Old Name", fixture: 1, round: 1, team_code: 10, opponent_team_code: 20, minutes: 90, starts: 1, total_points: 4 },
    { element: 9, player_code: 3003, name: "New Name", fixture: 2, round: 2, team_code: 10, opponent_team_code: 20, minutes: 90, starts: 1, total_points: 8 },
  ], "2024-25", "2026-01-01T00:00:00Z");
  const record = lookupOpponentHistory(dataset, 3003, 20, 6);
  assert.equal(record?.sampleSize, 2);
  assert.equal(record?.totalPoints, 12);
});

test("season-aware lookups never blend or fall back to older player history", () => {
  const older = normalizeVaastavRows([
    { element: 8, player_code: 3003, name: "Old Name", fixture: 1, round: 1, team_code: 10, opponent_team_code: 20, minutes: 90, starts: 1, total_points: 12 },
  ], "2024-25", "2026-01-01T00:00:00Z");
  const previous = normalizeVaastavRows([
    { element: 9, player_code: 3003, name: "New Name", fixture: 2, round: 1, team_code: 10, opponent_team_code: 20, minutes: 90, starts: 1, total_points: 4 },
  ], "2025-26", "2026-01-01T00:00:00Z");
  const dataset = indexHistoricalDataset(
    [...older.performances, ...previous.performances],
    [...older.seasonAggregates, ...previous.seasonAggregates],
    [...older.opponentAggregates, ...previous.opponentAggregates],
  );

  assert.equal(seasonAggregate(dataset, 3003, "2025-26")?.totalPoints, 4);
  assert.equal(lookupOpponentHistoryForSeason(dataset, 3003, 20, "2025-26")?.totalPoints, 4);
  assert.equal(seasonAggregate(dataset, 9999, "2025-26"), null);
  assert.equal(lookupOpponentHistoryForSeason(dataset, 3003, 30, "2025-26"), null);
});

test("malformed bootstrap players fail instead of becoming unknown free forwards", () => {
  assert.throws(() => normalizeBootstrap({ elements: [{ id: 1 }], teams: [] }), FplSchemaError);
});

test("valid fixture feed blanks are excluded while zero expected minutes is preserved", () => {
  const teams = [team(1, 10), team(2, 20), team(3, 30)];
  const fixtures = normalizeFixtures([
    { id: 1, event: 4, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, finished: false },
  ]);
  const scored = scorePlayers([
    player({ id: 1, teamId: 1, starts: 0, minutesPlayedSeason: 0 }),
    player({ id: 2, code: 102, teamId: 3, teamCode: 30 }),
  ], teams, fixtures, 3, { nextGameweek: 4 });
  assert.deepEqual(scored.map((item) => item.id), [1]);
  assert.equal(scored[0].expectedMinutes, 0);
});

test("historical snapshots are available and walk-forward inputs exclude the target GW", () => {
  const availability = getHistoricalAvailability();
  assert.equal(availability.status, "available");
  const dataset = normalizeVaastavRows([
    { element: 1, player_code: 1001, fixture: 1, round: 1, team_code: 10, opponent_team_code: 20, minutes: 90, starts: 1, total_points: 4 },
    { element: 2, player_code: 1001, fixture: 2, round: 2, team_code: 10, opponent_team_code: 20, minutes: 90, starts: 1, total_points: 15 },
  ], "2024-25", "2026-01-01T00:00:00Z");
  assert.equal(recordsAvailableBefore(dataset.performances, 2).length, 1);
  assert.deepEqual(recentPointsBefore(dataset.performances, 1001, 2), [4]);
});

test("start estimate uses completed fixtures and remains explicitly heuristic", () => {
  assert.equal(computeStartEstimate(player({ starts: 2 }), { completedTeamFixtures: 20, upcomingFixtureCount: 1 }), 10);
  assert.equal(computeStartEstimate(player({ status: "i", chanceOfPlayingNextRound: 0, starts: 20 }), { completedTeamFixtures: 20, upcomingFixtureCount: 1 }), 0);
});
