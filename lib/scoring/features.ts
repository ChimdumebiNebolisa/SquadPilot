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
  gameweeksPlayed: number,
): PlayerFeatureVector {
  const fixtureContext = getFixtureContext(player, fixtures);
  const opponent = teams.find((team) => team.id === fixtureContext.opponentTeamId);

  const recentForm = normalizeRange(player.form, 0, 10);
  const pointsPerGame = normalizeRange(player.pointsPerGame, 0, 10);

  // Expected minutes (0–1): blend FPL chance-of-playing with historical minutes per game.
  // History: avg fraction of 90 mins this season = minutesPlayedSeason / (gameweeksPlayed * 90), capped at 1.
  const defaultChanceWhenNull = player.position === "GK" ? 0.85 : 0.65;
  const chanceToPlay =
    player.chanceOfPlayingNextRound !== null
      ? clamp(player.chanceOfPlayingNextRound / 100)
      : defaultChanceWhenNull;

  const hasHistory = gameweeksPlayed > 0;
  const avgMinutesFraction = hasHistory
    ? clamp(player.minutesPlayedSeason / (gameweeksPlayed * 90))
    : 1;

  // expectedMinutes = P(plays) * expected fraction of 90 when they play (from history, or 1 if no history).
  let expectedMinutes = chanceToPlay * avgMinutesFraction;
  if (player.status === "i" || player.status === "s") {
    expectedMinutes *= 0.4;
  }
  expectedMinutes = clamp(expectedMinutes);

  const fixtureDifficulty = clamp((5 - fixtureContext.difficulty) / 4);
  const homeAway = fixtureContext.isHome === null ? 0.5 : fixtureContext.isHome ? 1 : 0;
  // Opponent strength: use actual API range (strength_overall_home is ~1000–1400), not fake 1–5
  const strengths = teams.map((t) => t.strength).filter((s): s is number => s != null);
  const minStr = strengths.length ? Math.min(...strengths) : 1000;
  const maxStr = strengths.length ? Math.max(...strengths) : 1400;
  const opponentStrength =
    opponent?.strength != null
      ? clamp(1 - (maxStr > minStr ? (opponent.strength - minStr) / (maxStr - minStr) : 0.5))
      : 0.5;

  const value = player.price > 0 ? clamp((player.pointsPerGame / player.price) / 1.2) : 0;
  const differential = clamp((25 - player.selectedByPercent) / 25);

  const health =
    player.status === "a"
      ? 1
      : player.chanceOfPlayingNextRound === null
        ? 0.65
        : clamp(player.chanceOfPlayingNextRound / 100);

  // FPL expected points for next GW: scale 0–15 maps to 0–1 (typical range ~0–10)
  const fplExpectedPoints = clamp(player.epNext / 15);

  // Attacking upside from ICT index; only MID/FWD get non-zero (GK/DEF use 0)
  const attackingUpside =
    player.position === "MID" || player.position === "FWD" ? clamp(player.ictIndex / 150) : 0;

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
    fplExpectedPoints,
    attackingUpside,
  };
}