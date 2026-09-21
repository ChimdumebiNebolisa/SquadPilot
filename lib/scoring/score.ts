import {
  latestSeasonAggregate,
  lookupOpponentHistory,
  lookupOpponentHistoryForSeason,
  seasonAggregate,
  type HistoricalDataset,
} from "@/lib/historical/normalize";
import { getFixturesForTeamAndEvent } from "@/lib/fpl/fixtures";
import type { NormalizedFixture, NormalizedPlayer, NormalizedTeam, OpponentHistoryView } from "@/lib/fpl/types";
import { computeStartEstimate, countCompletedFixturesForTeam } from "@/lib/scoring/chance-of-starting";
import { extractFeaturesForPlayer } from "@/lib/scoring/features";
import { buildPlayerExplanation } from "@/lib/scoring/explain";
import {
  predictCalibratedProjection,
  SCORING_MODEL_HISTORY_SEASON,
  SCORING_MODEL_VERSION,
} from "@/lib/scoring/model";
import { getWeightsForPosition } from "@/lib/scoring/weights";
import type { FactorContribution, PlayerFeatureVector, ProjectedPlayer, ScoringWeights } from "@/lib/scoring/types";

export interface ScoreOptions {
  nextGameweek?: number;
  historical?: HistoricalDataset | null;
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
): OpponentHistoryView[] {
  const baselinePointsPer90 = player.minutesPlayedSeason > 0
    ? (player.totalPoints / player.minutesPlayedSeason) * 90
    : player.pointsPerGame;
  const records: OpponentHistoryView[] = fixtures.flatMap((fixture) => {
      const historicalRecord = lookupOpponentHistory(historical ?? null, player.code, fixture.opponentTeamCode, baselinePointsPer90);
      return historicalRecord ? [{ ...historicalRecord, opponentTeamId: fixture.opponentTeamId, baselinePointsPer90 }] : [];
    });
  return records;
}

function previousSeasonPointsPer90(player: NormalizedPlayer, historical: HistoricalDataset | null | undefined): number | null {
  return latestSeasonAggregate(historical ?? null, player.code)?.pointsPer90 ?? null;
}

export function scorePlayers(
  players: NormalizedPlayer[],
  teams: NormalizedTeam[],
  fixtures: NormalizedFixture[],
  gameweeksPlayed: number,
  options: ScoreOptions = {},
): ProjectedPlayer[] {
  const nextGameweek = options.nextGameweek ?? 0;
  const teamIds = [...new Set(players.map((player) => player.teamId))];
  const fixtureSummaryByTeam = new Map(teamIds.map((teamId) => [
    teamId,
    nextGameweek > 0
      ? getFixturesForTeamAndEvent(teamId, nextGameweek, fixtures, teams)
      : { fixtures: [], fixtureCount: 0, averageDifficulty: null, homeCount: 0, awayCount: 0, status: "missing" as const },
  ]));
  const completedFixturesByTeam = new Map(teamIds.map((teamId) => [
    teamId,
    countCompletedFixturesForTeam(teamId, fixtures) || gameweeksPlayed,
  ]));

  return players
    .map<ProjectedPlayer | null>((player) => {
      const fixtureSummary = fixtureSummaryByTeam.get(player.teamId);
      if (!fixtureSummary) return null;
      if (fixtureSummary.fixtureCount === 0) return null;
      const opponentHistory = historicalForPlayer(player, fixtureSummary.fixtures, options.historical);
      const previousSeasonBaseline = previousSeasonPointsPer90(player, options.historical);
      const fivePlusPreviousSeason = seasonAggregate(
        options.historical ?? null,
        player.code,
        SCORING_MODEL_HISTORY_SEASON,
      );
      const fivePlusOpponentHistory = fixtureSummary.fixtures.flatMap((fixture) => {
        const record = lookupOpponentHistoryForSeason(
          options.historical ?? null,
          player.code,
          fixture.opponentTeamCode,
          SCORING_MODEL_HISTORY_SEASON,
        );
        return record ? [record] : [];
      });
      const featureResult = extractFeaturesForPlayer(player, teams, fixtures, {
        nextGameweek,
        gameweeksPlayed,
        completedTeamFixtures: completedFixturesByTeam.get(player.teamId) ?? gameweeksPlayed,
        opponentHistory,
        previousSeasonPointsPer90: previousSeasonBaseline,
        fivePlusPreviousSeason,
        fivePlusOpponentHistory,
        fixtureSummary,
      });
      const weights = getWeightsForPosition(player.position);
      const contributions = toContributions(featureResult.features, weights);
      const calibrated = predictCalibratedProjection(
        player.position,
        featureResult.features,
        featureResult.fivePlusFeatures,
        featureResult.fixtureCount,
      );
      const projectedScore = calibrated.projectedPoints;
      const projectedPoints = calibrated.projectedPoints;
      const startEstimate = computeStartEstimate(player, {
        completedTeamFixtures: completedFixturesByTeam.get(player.teamId) ?? gameweeksPlayed,
        upcomingFixtureCount: featureResult.fixtureCount,
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
        fivePlusProbability: calibrated.fivePlusProbability,
        startEstimatePercent: startEstimate,
        expectedMinutes: featureResult.expectedMinutes,
        fixtureCount: featureResult.fixtureCount,
        fixtureStatus: "scheduled",
        upcomingFixtures: featureResult.upcomingFixtures,
        opponentTeamId: featureResult.upcomingFixtures[0]?.opponentTeamId ?? null,
        opponentHistory,
        historicalSampleSize,
        historicalDataStatus,
        dataSources: [...dataSources],
        contributions,
        explanation: buildPlayerExplanation({ position: player.position, contributions }),
      };
    })
    .filter((player): player is ProjectedPlayer => player !== null)
    .sort((a, b) => b.projectedScore - a.projectedScore);
}

export { SCORING_MODEL_VERSION };
