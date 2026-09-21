import assert from "node:assert/strict";
import { test } from "node:test";
import { countCompletedTeamFixtures, getFixturesForTeamAndEvent, opponentDefenceStrength } from "@/lib/fpl/fixtures";
import {
  FplSchemaError,
  normalizeBootstrap,
  normalizeFixtures,
  resolveNextGameweek,
  SeasonCompleteError,
} from "@/lib/fpl/normalize";
import { normalizeCurrentUserTeam } from "@/lib/fpl/team";
import type { NormalizedPlayer, NormalizedTeam, OpponentHistoryView } from "@/lib/fpl/types";
import { normalizeVaastavRows } from "@/lib/historical/normalize";
import { extractFeaturesForPlayer } from "@/lib/scoring/features";
import { buildPlayerExplanation } from "@/lib/scoring/explain";
import type { FactorContribution, PlayerFeatureVector } from "@/lib/scoring/types";

const source = { source: "fpl-live" as const, season: "current", gameweek: null, fixtureId: null, asOf: "2026-01-01T00:00:00Z", confidence: "high" as const, availability: "available" as const };

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
    position: "FWD",
    price: 7,
    totalPoints: 20,
    form: 12,
    pointsPerGame: 4,
    selectedByPercent: 35,
    status: "d",
    news: "",
    chanceOfPlayingNextRound: null,
    epNext: 30,
    ictIndex: 300,
    minutesPlayedSeason: 135,
    starts: 1,
    goals: 1,
    assists: 0,
    expectedGoals: null,
    expectedAssists: null,
    cornersAndIndirectFreeKicksOrder: 2,
    directFreeKicksOrder: null,
    penaltiesOrder: 1,
    ...overrides,
  };
}

function team(id: number, strength: number | null = 1200): NormalizedTeam {
  return {
    source,
    id,
    code: id * 10,
    name: `Team ${id}`,
    shortName: `T${id}`,
    strength: 3,
    strengthOverallHome: strength,
    strengthOverallAway: strength,
    strengthAttackHome: strength,
    strengthAttackAway: strength,
    strengthDefenceHome: strength,
    strengthDefenceAway: strength,
  };
}

test("normalizers cover coercible optional fields and reject invalid core fields", () => {
  const normalized = normalizeBootstrap({
    elements: [{
      id: "1", code: "101", web_name: "Test", first_name: "Test", second_name: "Player",
      team: "1", team_code: "10", element_type: "4", now_cost: "70", total_points: "20",
      chance_of_playing_next_round: "", expected_goals: "1.2", expected_assists: null,
    }],
    teams: [{ id: "1", code: "10", name: "Team", short_name: "T", strength: 0 }],
  });
  assert.equal(normalized.players[0].price, 7);
  assert.equal(normalized.players[0].chanceOfPlayingNextRound, null);
  assert.equal(normalized.players[0].expectedGoals, 1.2);
  assert.equal(normalized.teams[0].strength, null);
  assert.throws(() => normalizeBootstrap({ elements: [], teams: [{ id: 0 }] }), FplSchemaError);
  assert.throws(() => normalizeBootstrap({ elements: [{ id: 1, code: 1, web_name: "X", first_name: "X", second_name: "Y", team: 1, team_code: 1, element_type: 5, now_cost: 1 }], teams: [] }), FplSchemaError);
  assert.throws(() => normalizeFixtures([]), FplSchemaError);
  assert.throws(() => normalizeBootstrap(null), FplSchemaError);
  assert.throws(() => resolveNextGameweek({ events: [{ id: 1, finished: true }] }), SeasonCompleteError);
});

test("fixture helpers distinguish partial data, completed matches, and venue strength", () => {
  const fixtures = normalizeFixtures([
    { id: 1, event: 2, team_h: 1, team_a: 2, team_h_difficulty: null, team_a_difficulty: 4, finished_provisional: true },
  ]);
  assert.equal(getFixturesForTeamAndEvent(1, 2, fixtures, [team(1), team(2)]).status, "partial");
  assert.equal(getFixturesForTeamAndEvent(3, 2, fixtures).status, "missing");
  assert.equal(countCompletedTeamFixtures(1, fixtures), 1);
  assert.equal(opponentDefenceStrength(team(2), true), 1200);
  assert.equal(opponentDefenceStrength(team(2), false), 1200);
  assert.equal(opponentDefenceStrength(undefined, false), null);
});

test("team normalization handles rich and absent optional payloads", () => {
  const rich = normalizeCurrentUserTeam(42, { name: "XI", current_event: "2", value: "998" }, { current: [] }, {
    event: "1",
    entry_history: { bank: "15", value: "1001", free_transfers_available: "2", event_transfers: "1" },
    picks: [null, { element: "7", position: "1", multiplier: "2", is_captain: true }, { element: 0 }],
  });
  assert.equal(rich.currentEvent, 1);
  assert.equal(rich.squad.length, 1);
  assert.equal(rich.freeTransfers, 2);
  assert.equal(rich.historyAvailable, true);
  const absent = normalizeCurrentUserTeam(42, null, null, null);
  assert.equal(absent.teamName, null);
  assert.equal(absent.picksAvailable, false);
  assert.equal(absent.bank, null);
});

test("feature extraction covers availability, set pieces, no-fixture and opponent-history paths", () => {
  const noFixture = extractFeaturesForPlayer(player({ price: 0, status: "i", starts: 0, minutesPlayedSeason: 0 }), [], [], 0);
  assert.equal(noFixture.fixtureCount, 0);
  assert.equal(noFixture.features.opponentStrength, 0.5);
  assert.equal(noFixture.features.value, 0);

  const fixtures = normalizeFixtures([{ id: 1, event: 2, team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4 }]);
  const history: OpponentHistoryView = {
    source,
    playerCode: 101,
    playerName: "Test",
    opponentTeamCode: 20,
    opponentTeamId: 2,
    matches: 1,
    starts: 1,
    minutes: 90,
    totalPoints: 8,
    pointsPer90: 8,
    shrunkPointsPer90: 6,
    homeMatches: 1,
    awayMatches: 0,
    sampleSize: 1,
    dataStatus: "available",
    baselinePointsPer90: 0,
  };
  const result = extractFeaturesForPlayer(player({ chanceOfPlayingNextRound: 50 }), [team(1), team(2)], fixtures, {
    gameweeksPlayed: 1,
    completedTeamFixtures: 0,
    nextGameweek: 2,
    opponentHistory: [history],
    previousSeasonPointsPer90: 7,
  });
  assert.equal(result.fixtureCount, 1);
  assert.equal(result.features.setPiece, 1);
  assert.equal(result.features.attackingUpside, 1);
  assert.equal(result.features.historicalVsOpponent, 0.5);
});

test("historical normalization rejects incomplete identity and handles partial records", () => {
  const dataset = normalizeVaastavRows([
    { element: 1, fixture: 1, round: 1 },
    { element: 2, player_code: 22, fixture: 2, round: 2, element_type: 5 },
    { element: 3, player_code: 33, fixture: 3, round: 3, minutes: "bad", starts: 0, total_points: 0 },
  ], "2024-25", "2026-01-01T00:00:00Z");
  assert.equal(dataset.performances.length, 1);
  assert.equal(dataset.performances[0].source.availability, "partial");
  assert.equal(dataset.seasonAggregates[0].pointsPer90, 0);
});

test("explanations derive downside text from the weakest player-specific factor", () => {
  const factors = Object.keys({
    recentForm: 1,
    pointsPerGame: 1,
    expectedMinutes: 1,
    fixtureDifficulty: 1,
    homeAway: 1,
    opponentStrength: 1,
    value: 1,
    differential: 1,
    health: 1,
    setPiece: 1,
    historicalVsOpponent: 1,
    historicalBaseline: 1,
    fplExpectedPoints: 1,
    attackingUpside: 1,
  } satisfies Record<keyof PlayerFeatureVector, number>) as Array<keyof PlayerFeatureVector>;
  const contributions: FactorContribution[] = factors.map((factor) => ({
    factor,
    value: factor === "value" ? 0.2 : factor === "fixtureDifficulty" ? 0.5 : 0.9,
    weight: 0.1,
    contribution: factor === "value" ? 0.02 : 0.09,
  }));
  const explanation = buildPlayerExplanation({ position: "DEF", contributions });
  assert.equal(explanation.mainRisk, "pricey for output.");
});
