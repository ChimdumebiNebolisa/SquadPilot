import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import type { NormalizedFixture, NormalizedPlayer, NormalizedTeam } from "@/lib/fpl/types";
import { scorePlayers } from "@/lib/scoring/score";

const source = { source: "fpl-live" as const, season: "current", gameweek: null, fixtureId: null, asOf: "2026-01-01T00:00:00Z", confidence: "high" as const, availability: "available" as const };

test("warm scoring of approximately 850 players stays under 100 ms", () => {
  const teams: NormalizedTeam[] = Array.from({ length: 20 }, (_, index) => ({
    source,
    id: index + 1,
    code: 500 + index,
    name: `Team ${index + 1}`,
    shortName: `T${index + 1}`,
    strength: 3,
    strengthOverallHome: 1200,
    strengthOverallAway: 1200,
    strengthAttackHome: 1200,
    strengthAttackAway: 1200,
    strengthDefenceHome: 1200,
    strengthDefenceAway: 1200,
  }));
  const players: NormalizedPlayer[] = Array.from({ length: 850 }, (_, index) => ({
    source,
    id: index + 1,
    code: 50_000 + index,
    webName: `P${index + 1}`,
    firstName: "Player",
    lastName: String(index + 1),
    teamId: index % 20 + 1,
    teamCode: 500 + index % 20,
    position: (["GK", "DEF", "MID", "FWD"] as const)[index % 4],
    price: 4.5 + index % 8 / 2,
    totalPoints: index % 150,
    form: index % 10,
    pointsPerGame: index % 8,
    selectedByPercent: index % 30,
    status: "a",
    news: "",
    chanceOfPlayingNextRound: null,
    epNext: 4,
    ictIndex: 80,
    minutesPlayedSeason: 900,
    starts: 10,
    goals: 0,
    assists: 0,
    expectedGoals: null,
    expectedAssists: null,
    cornersAndIndirectFreeKicksOrder: null,
    directFreeKicksOrder: null,
    penaltiesOrder: null,
  }));
  const fixtures: NormalizedFixture[] = Array.from({ length: 10 }, (_, index) => ({
    source: { ...source, gameweek: 25, fixtureId: index + 1 },
    id: index + 1,
    event: 25,
    kickoffTime: null,
    teamH: index * 2 + 1,
    teamA: index * 2 + 2,
    teamHDifficulty: 2,
    teamADifficulty: 3,
    finished: false,
    finishedProvisional: false,
  }));

  scorePlayers(players, teams, fixtures, 24, { nextGameweek: 25 });
  const timings = Array.from({ length: 5 }, () => {
    const started = performance.now();
    const result = scorePlayers(players, teams, fixtures, 24, { nextGameweek: 25 });
    const elapsed = performance.now() - started;
    assert.equal(result.length, 850);
    return elapsed;
  });
  const average = timings.reduce((sum, value) => sum + value, 0) / timings.length;
  assert.ok(average < 100, `Average warm scoring time was ${average.toFixed(1)} ms.`);
});
