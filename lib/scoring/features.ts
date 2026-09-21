import type { HistoricalDataset } from "@/lib/historical/normalize";
import { getFixturesForTeamAndEvent, opponentDefenceStrength, type TeamFixtureSummary } from "@/lib/fpl/fixtures";
import type { NormalizedFixture, NormalizedPlayer, NormalizedTeam, OpponentHistoryView } from "@/lib/fpl/types";
import {
  buildFivePlusReplayFeatures,
  buildModelFeatures,
  type FivePlusFeatureVector,
} from "@/lib/scoring/model-features";
import type { PlayerFeatureVector } from "@/lib/scoring/types";

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export interface FeatureContext {
  nextGameweek?: number;
  gameweeksPlayed: number;
  completedTeamFixtures?: number;
  historical?: HistoricalDataset | null;
  opponentHistory?: OpponentHistoryView[];
  previousSeasonPointsPer90?: number | null;
  fixtureSummary?: TeamFixtureSummary;
}

export interface PlayerFeatureResult {
  features: PlayerFeatureVector;
  fivePlusFeatures: FivePlusFeatureVector;
  upcomingFixtures: ReturnType<typeof getFixturesForTeamAndEvent>["fixtures"];
  fixtureCount: number;
  expectedMinutes: number;
  opponentHistory: OpponentHistoryView[];
}

function availabilityFromStatus(status: string): number {
  if (status === "a") return 1;
  if (status === "d") return 0.4;
  if (status === "i" || status === "s") return 0.05;
  return 0.6;
}

function setPieceScore(player: NormalizedPlayer): number {
  const orders = [
    player.cornersAndIndirectFreeKicksOrder,
    player.directFreeKicksOrder,
    player.penaltiesOrder,
  ].filter((order): order is number => order != null && order > 0);
  if (orders.length === 0) return 0;
  return clamp(1 - (Math.min(...orders) - 1) / 4);
}

function getOpponentHistory(
  player: NormalizedPlayer,
  upcomingFixtures: ReturnType<typeof getFixturesForTeamAndEvent>["fixtures"],
  context: FeatureContext,
): OpponentHistoryView[] {
  return upcomingFixtures
    .map((fixture) => context.opponentHistory?.find((record) => record.opponentTeamId === fixture.opponentTeamId))
    .filter((record): record is OpponentHistoryView => record != null)
    .map((record) => ({ ...record, playerId: player.id }));
}

export function extractFeaturesForPlayer(
  player: NormalizedPlayer,
  teams: NormalizedTeam[],
  fixtures: NormalizedFixture[],
  contextOrGameweeks: FeatureContext | number,
): PlayerFeatureResult {
  const context: FeatureContext = typeof contextOrGameweeks === "number"
    ? { gameweeksPlayed: contextOrGameweeks }
    : contextOrGameweeks;
  const nextGameweek = context.nextGameweek ?? 0;
  const fixtureSummary = context.fixtureSummary ?? (nextGameweek > 0
    ? getFixturesForTeamAndEvent(player.teamId, nextGameweek, fixtures, teams)
    : { fixtures: [], fixtureCount: 0, averageDifficulty: null, homeCount: 0, awayCount: 0, status: "missing" as const });
  const opponentHistory = getOpponentHistory(player, fixtureSummary.fixtures, context);
  const opponent = teams.find((team) => team.id === fixtureSummary.fixtures[0]?.opponentTeamId);
  const firstFixtureIsHome = fixtureSummary.fixtures[0]?.isHome ?? null;

  const availability = player.chanceOfPlayingNextRound !== null
    ? clamp(player.chanceOfPlayingNextRound / 100)
    : availabilityFromStatus(player.status);
  const teamFixturesPlayed = context.completedTeamFixtures ?? Math.max(1, context.gameweeksPlayed);
  const startRate = teamFixturesPlayed > 0 ? clamp(player.starts / teamFixturesPlayed) : 0.65;
  const averageStartMinutes = player.starts > 0 ? clamp(player.minutesPlayedSeason / player.starts / 90) : 0;
  const substituteMinutes = Math.max(0, player.minutesPlayedSeason - player.starts * 90);
  const substituteAppearances = Math.max(0, teamFixturesPlayed - player.starts);
  const averageSubMinutes = substituteAppearances > 0 ? clamp(substituteMinutes / substituteAppearances / 90) : 0;
  const expectedMinutes = clamp(availability * (startRate * averageStartMinutes + (1 - startRate) * averageSubMinutes));

  const averageDifficulty = fixtureSummary.averageDifficulty ?? 3;
  const homeFixtureFraction = fixtureSummary.fixtureCount === 0
    ? 0.5
    : fixtureSummary.homeCount / fixtureSummary.fixtureCount;
  const strengths = teams.flatMap((team) => [team.strengthOverallHome, team.strengthOverallAway]).filter((strength): strength is number => strength != null);
  const minStrength = strengths.length ? Math.min(...strengths) : 0;
  const maxStrength = strengths.length ? Math.max(...strengths) : 1;
  const opponentStrengthValue = opponentDefenceStrength(opponent, firstFixtureIsHome === true);
  const opponentStrength = opponentStrengthValue == null
    ? 0.5
    : clamp(1 - (maxStrength > minStrength ? (opponentStrengthValue - minStrength) / (maxStrength - minStrength) : 0.5));
  const differential = clamp((25 - player.selectedByPercent) / 25);
  const health = player.chanceOfPlayingNextRound !== null ? availability : availabilityFromStatus(player.status);
  const fplExpectedPoints = clamp(player.epNext / 15);
  const attackingUpside = player.position === "MID" || player.position === "FWD" ? clamp(player.ictIndex / 150) : 0;
  const historicalOpponentRatio = opponentHistory.length
    ? opponentHistory.reduce((sum, record) => {
        const baseline = record.baselinePointsPer90 ?? player.pointsPerGame;
        return sum + (baseline > 0 ? record.shrunkPointsPer90 / (baseline * 1.2) : 0.5);
      }, 0) / opponentHistory.length
    : 0.5;
  const modelFeatures = buildModelFeatures({
    recentPointsPerMatch: player.form,
    pointsPerGame: player.pointsPerGame,
    expectedMinutesFraction: expectedMinutes,
    averageFixtureDifficulty: averageDifficulty,
    homeFixtureFraction,
    price: player.price,
    historicalOpponentRatio,
  });
  const fivePlusFeatures = buildFivePlusReplayFeatures({
    totalPoints: player.totalPoints,
    minutes: player.minutesPlayedSeason,
    completedTeamFixtures: teamFixturesPlayed,
    averageFixtureDifficulty: averageDifficulty,
    homeFixtureFraction,
    price: player.price,
    fixtureCount: fixtureSummary.fixtureCount,
  });
  const currentBaselinePointsPer90 = player.minutesPlayedSeason > 0
    ? (player.totalPoints / player.minutesPlayedSeason) * 90
    : player.pointsPerGame;
  const historicalBaseline = context.previousSeasonPointsPer90 == null
    ? 0.5
    : clamp(context.previousSeasonPointsPer90 / Math.max(1, currentBaselinePointsPer90 * 1.2));

  return {
    features: {
      ...modelFeatures,
      opponentStrength,
      differential,
      health,
      setPiece: setPieceScore(player),
      historicalBaseline,
      // This is exposed as a baseline comparator. Its scoring weight is intentionally zero.
      fplExpectedPoints,
      attackingUpside,
    },
    fivePlusFeatures,
    upcomingFixtures: fixtureSummary.fixtures,
    fixtureCount: fixtureSummary.fixtureCount,
    expectedMinutes: expectedMinutes * 90,
    opponentHistory,
  };
}
