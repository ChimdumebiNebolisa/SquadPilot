import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWalkForwardSamples } from "@/scripts/modeling.mjs";

function performance(season: string, round: number, totalPoints: number, playerCode = 101) {
  return {
    source: {
      source: "vaastav-historical",
      season,
      gameweek: round,
      fixtureId: round,
      asOf: "2026-01-01T00:00:00Z",
      confidence: "high",
      availability: "available",
    },
    sourcePlayerId: 1,
    playerCode,
    playerName: "Test",
    position: "MID",
    sourceTeamId: 1,
    teamCode: 10,
    sourceOpponentTeamId: 2,
    opponentTeamCode: 20,
    wasHome: true,
    minutes: 90,
    starts: 1,
    totalPoints,
    goals: 0,
    assists: 0,
    expectedGoals: null,
    expectedAssists: null,
    value: 70,
    fixtureDifficulty: 2,
  };
}

test("walk-forward probability features use only earlier gameweeks and the previous season", () => {
  const previousSeason = [performance("2023-24", 1, 9)];
  const currentSeason = [
    performance("2024-25", 1, 4),
    performance("2024-25", 2, 12),
  ];
  const samples = buildWalkForwardSamples(currentSeason, previousSeason);

  assert.equal(samples.length, 1);
  assert.equal(samples[0].gameweek, 2);
  assert.equal(samples[0].target, 12);
  assert.equal(samples[0].fivePlusFeatures.seasonPointsPerFixture, 0.4);
  assert.equal(samples[0].fivePlusFeatures.previousSeasonPointsPer90, 0.9);
  assert.equal(samples[0].fivePlusFeatures.opponentHistoryCoverage, 1);
});

test("walk-forward history joins by stable player code and leaves missing history explicit", () => {
  const previousSeason = [performance("2023-24", 1, 9, 999)];
  const currentSeason = [performance("2024-25", 1, 4), performance("2024-25", 2, 6)];
  const [sample] = buildWalkForwardSamples(currentSeason, previousSeason);

  assert.equal(sample.fivePlusFeatures.previousSeasonAvailable, 0);
  assert.equal(sample.fivePlusFeatures.previousSeasonPointsPer90, 0);
  assert.equal(sample.fivePlusFeatures.opponentHistoryCoverage, 0);
});
