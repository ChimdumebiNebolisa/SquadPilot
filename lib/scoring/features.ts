import type { NormalizedFixture, NormalizedPlayer, NormalizedTeam } from "@/lib/fpl/types";
import type { PlayerFeatureVector } from "@/lib/scoring/types";

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRange(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }

  return clamp((value - min) / (max - min));
}

function getFixtureContext(player: NormalizedPlayer, fixtures: NormalizedFixture[]) {
  const fixture = fixtures.find((entry) => entry.teamH === player.teamId || entry.teamA === player.teamId);

  if (!fixture) {
    return {
      isHome: null as boolean | null,
      difficulty: 3,
      opponentTeamId: null as number | null,
    };
  }

  const isHome = fixture.teamH === player.teamId;

  return {
    isHome,
    difficulty: isHome ? (fixture.teamHDifficulty ?? 3) : (fixture.teamADifficulty ?? 3),
    opponentTeamId: isHome ? fixture.teamA : fixture.teamH,
  };
}

export function extractFeaturesForPlayer(
  player: NormalizedPlayer,
  teams: NormalizedTeam[],
  fixtures: NormalizedFixture[],
): PlayerFeatureVector {
  const fixtureContext = getFixtureContext(player, fixtures);
  const opponent = teams.find((team) => team.id === fixtureContext.opponentTeamId);

  const recentForm = normalizeRange(player.form, 0, 10);
  const pointsPerGame = normalizeRange(player.pointsPerGame, 0, 10);

  const minutesBase = player.chanceOfPlayingNextRound === null ? 0.85 : clamp(player.chanceOfPlayingNextRound / 100);
  const expectedMinutes = player.status === "i" || player.status === "s" ? minutesBase * 0.4 : minutesBase;

  const fixtureDifficulty = clamp((5 - fixtureContext.difficulty) / 4);
  const homeAway = fixtureContext.isHome === null ? 0.5 : fixtureContext.isHome ? 1 : 0;
  const opponentStrength = opponent?.strength ? clamp(1 - normalizeRange(opponent.strength, 1, 5)) : 0.5;

  const value = player.price > 0 ? clamp((player.pointsPerGame / player.price) / 1.2) : 0;
  const differential = clamp((25 - player.selectedByPercent) / 25);

  const health =
    player.status === "a"
      ? 1
      : player.chanceOfPlayingNextRound === null
        ? 0.65
        : clamp(player.chanceOfPlayingNextRound / 100);

  return {
    recentForm,
    pointsPerGame,
    expectedMinutes,
    fixtureDifficulty,
    homeAway,
    opponentStrength,
    value,
    differential,
    health,
    setPiece: 0,
    historicalVsOpponent: 0,
  };
}