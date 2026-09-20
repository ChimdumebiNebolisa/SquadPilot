import { lookupOpponentHistory, type HistoricalDataset } from "@/lib/historical/normalize";
import { getFixturesForTeamAndEvent } from "@/lib/fpl/fixtures";
import type { NormalizedFixture, NormalizedPlayer, NormalizedTeam, OpponentHistoryView } from "@/lib/fpl/types";
import { computeStartEstimate, countCompletedFixturesForTeam } from "@/lib/scoring/chance-of-starting";
import { extractFeaturesForPlayer } from "@/lib/scoring/features";
import { buildPlayerExplanation } from "@/lib/scoring/explain";
import { estimateFivePlusPoints } from "@/lib/scoring/probability";
import { getWeightsForPosition } from "@/lib/scoring/weights";
import type { FactorContribution, PlayerFeatureVector, ProjectedPlayer, ScoringWeights } from "@/lib/scoring/types";

export interface ScoreOptions {
  nextGameweek?: number;
  historical?: HistoricalDataset | null;
  currentSeasonOpponentHistory?: Map<number, OpponentHistoryView[]>;
  currentSeasonPreviousSeasonBaseline?: Map<number, number | null>;
}

function toContributions(features: PlayerFeatureVector, weights: ScoringWeights): FactorContribution[] {
  return (Object.keys(features) as Array<keyof PlayerFeatureVector>).map((factor) => {
    const value = features[factor];
    const weight = weights[factor];
    return { factor, value, weight, contribution: value * weight };
  });
}

function historicalForPlayer(
  player: NormalizedPlayer,
  fixtures: ReturnType<typeof getFixturesForTeamAndEvent>["fixtures"],
  historical: HistoricalDataset | null | undefined,
  currentSeason: Map<number, OpponentHistoryView[]> | undefined,
): OpponentHistoryView[] {
  const current = currentSeason?.get(player.id) ?? [];
  const baselinePointsPer90 = player.minutesPlayedSeason > 0
    ? (player.totalPoints / player.minutesPlayedSeason) * 90
    : player.pointsPerGame;
  const records: OpponentHistoryView[] = fixtures.flatMap((fixture) => {
      const existing = current.find((record) => record.opponentTeamId === fixture.opponentTeamId);
      if (existing) return [{ ...existing, baselinePointsPer90 }];
      const historicalRecord = lookupOpponentHistory(historical ?? null, player.id, fixture.opponentTeamId, baselinePointsPer90, `${player.firstName} ${player.lastName}`);
      return historicalRecord ? [{ ...historicalRecord, baselinePointsPer90 }] : [];
    });
  return records;
}

function normalizePlayerName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function previousSeasonPointsPer90(player: NormalizedPlayer, historical: HistoricalDataset | null | undefined): number | null {
  const playerName = normalizePlayerName(`${player.firstName} ${player.lastName}`);
  const aggregates = historical?.seasonAggregates.filter((aggregate) =>
    aggregate.playerId === player.id || (aggregate.playerName != null && normalizePlayerName(aggregate.playerName) === playerName),
  ) ?? [];
  return [...aggregates].sort((left, right) => right.season.localeCompare(left.season))[0]?.pointsPer90 ?? null;
}

export function scorePlayers(
  players: NormalizedPlayer[],
  teams: NormalizedTeam[],
  fixtures: NormalizedFixture[],
  gameweeksPlayed: number,
  options: ScoreOptions = {},
): ProjectedPlayer[] {
  const nextGameweek = options.nextGameweek ?? 0;

  return players
    .map((player) => {
      const fixtureSummary = nextGameweek > 0
        ? getFixturesForTeamAndEvent(player.teamId, nextGameweek, fixtures)
        : { fixtures: [], fixtureCount: 0, averageDifficulty: null, homeCount: 0, awayCount: 0, status: "missing" as const };
      const opponentHistory = historicalForPlayer(player, fixtureSummary.fixtures, options.historical, options.currentSeasonOpponentHistory);
      const previousSeasonBaseline = options.currentSeasonPreviousSeasonBaseline?.get(player.id)
        ?? previousSeasonPointsPer90(player, options.historical);
      const featureResult = extractFeaturesForPlayer(player, teams, fixtures, {
        nextGameweek,
        gameweeksPlayed,
        completedTeamFixtures: countCompletedFixturesForTeam(player.teamId, fixtures) || gameweeksPlayed,
        opponentHistory,
        previousSeasonPointsPer90: previousSeasonBaseline,
      });
      const weights = getWeightsForPosition(player.position);
      const contributions = toContributions(featureResult.features, weights);
      const perFixtureScore = contributions.reduce((sum, entry) => sum + entry.contribution, 0);
      const fixtureMultiplier = featureResult.fixtureCount > 0 ? featureResult.fixtureCount : 1;
      const projectedScore = perFixtureScore * fixtureMultiplier;
      const projectedPoints = Number((projectedScore * 10).toFixed(2));
      const fivePlusPointsEstimate = estimateFivePlusPoints(player.position, projectedPoints, featureResult.features);
      const startEstimate = computeStartEstimate(player, {
        completedTeamFixtures: countCompletedFixturesForTeam(player.teamId, fixtures) || gameweeksPlayed,
        upcomingFixtureCount: Math.max(1, featureResult.fixtureCount),
      });
      const historicalSampleSize = opponentHistory.reduce((sum, record) => sum + record.sampleSize, 0);
      const historicalDataStatus = opponentHistory.length === 0 && previousSeasonBaseline == null
        ? "missing"
        : opponentHistory.every((record) => record.dataStatus === "available")
          ? "available"
          : "partial";
      const dataSources = historicalSampleSize > 0 || previousSeasonBaseline != null
        ? ["fpl-live", "vaastav-historical"] as const
        : ["fpl-live"] as const;

      return {
        ...player,
        projectedScore,
        projectedPoints,
        fivePlusPointsEstimate,
        chanceOfFivePlusPoints: fivePlusPointsEstimate,
        chanceOfStarting: startEstimate,
        expectedMinutes: featureResult.expectedMinutes,
        fixtureCount: featureResult.fixtureCount,
        upcomingFixtures: featureResult.upcomingFixtures,
        opponentTeamId: featureResult.upcomingFixtures[0]?.opponentTeamId ?? null,
        opponentHistory,
        historicalSampleSize,
        historicalDataStatus,
        dataSources: [...dataSources],
        contributions,
        explanation: buildPlayerExplanation({ position: player.position, contributions }),
      } satisfies ProjectedPlayer;
    })
    .sort((a, b) => b.projectedScore - a.projectedScore);
}
