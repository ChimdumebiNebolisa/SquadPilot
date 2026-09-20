import assert from "node:assert/strict";
import { test } from "node:test";
import { BUDGET_CAP, chooseBestStartingXI, fallbackRecommendation, hasLegalCaptainLinks } from "@/lib/solver/recommend";
import type { ProjectedPlayer } from "@/lib/scoring/types";

function projected(id: number, position: ProjectedPlayer["position"], teamId: number, price: number): ProjectedPlayer {
  return {
    source: { source: "fpl-live", season: "current", gameweek: 1, fixtureId: null, asOf: "2026-01-01T00:00:00.000Z", confidence: "high", availability: "available" },
    id, webName: `P${id}`, firstName: "", lastName: "", teamId, position, price, totalPoints: 50, form: 5,
    pointsPerGame: 5, selectedByPercent: 10, status: "a", news: "", chanceOfPlayingNextRound: 100, epNext: 5,
    ictIndex: 100, minutesPlayedSeason: 900, starts: 10, goals: 0, assists: 0, expectedGoals: null, expectedAssists: null,
    cornersAndIndirectFreeKicksOrder: null, directFreeKicksOrder: null, penaltiesOrder: null,
    projectedScore: 1, projectedPoints: 10, fivePlusPointsEstimate: 50, chanceOfFivePlusPoints: 50, chanceOfStarting: 80,
    expectedMinutes: 72, fixtureCount: 1, upcomingFixtures: [], opponentHistory: [], historicalSampleSize: 0,
    historicalDataStatus: "missing", dataSources: ["fpl-live"], contributions: [],
    explanation: { summary: "", whyPicked: "", mainRisk: "", confidence: "Medium", tags: [] },
  };
}

function validPool(price = 5): ProjectedPlayer[] {
  const players: ProjectedPlayer[] = [];
  let id = 1;
  for (const [position, count] of [["GK", 3], ["DEF", 7], ["MID", 7], ["FWD", 5]] as const) {
    for (let index = 0; index < count; index += 1) players.push(projected(id++, position, id % 8, price));
  }
  return players;
}

test("fallback remains budget safe and links captain and vice-captain to XI", () => {
  const result = fallbackRecommendation(validPool());
  assert.ok(result);
  assert.equal(result.squad.length, 15);
  assert.equal(result.startingXI.length, 11);
  assert.equal(result.bench.length, 4);
  assert.ok(result.budgetUsed <= BUDGET_CAP);
  assert.ok(result.startingXI.some((player) => player.id === result.captain.id));
  assert.ok(result.startingXI.some((player) => player.id === result.viceCaptain.id));
});

test("over-budget fallback returns no recommendation instead of a silently illegal squad", () => {
  assert.equal(fallbackRecommendation(validPool(10)), null);
});

test("starting XI is infeasible when a legal formation cannot be formed", () => {
  assert.equal(chooseBestStartingXI(validPool().filter((player) => player.position !== "FWD")), null);
});

test("captain and vice-captain links reject players outside the XI", () => {
  const pool = validPool();
  const xi = pool.slice(0, 11);
  assert.equal(hasLegalCaptainLinks(xi, pool[12], xi[1]), false);
  assert.equal(hasLegalCaptainLinks(xi, xi[0], xi[1]), true);
});
