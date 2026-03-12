import type { NormalizedFixture, NormalizedPlayer, NormalizedTeam } from "@/lib/fpl/types";
import { extractFeaturesForPlayer } from "@/lib/scoring/features";
import { buildPlayerExplanation } from "@/lib/scoring/explain";
import { chanceOfFivePlusPoints } from "@/lib/scoring/probability";
import { getWeightsForPosition } from "@/lib/scoring/weights";
import type { FactorContribution, PlayerFeatureVector, ProjectedPlayer, ScoringWeights } from "@/lib/scoring/types";

function toContributions(features: PlayerFeatureVector, weights: ScoringWeights): FactorContribution[] {
  const factors = Object.keys(features) as Array<keyof PlayerFeatureVector>;

  return factors.map((factor) => {
    const value = features[factor];
    const weight = weights[factor];
    const contribution = value * weight;

    return {
      factor,
      value,
      weight,
      contribution,
    };
  });
}

export function scorePlayers(
  players: NormalizedPlayer[],
  teams: NormalizedTeam[],
  fixtures: NormalizedFixture[],
): ProjectedPlayer[] {
  return players
    .map((player) => {
      const features = extractFeaturesForPlayer(player, teams, fixtures);
      const weights = getWeightsForPosition(player.position);
      const contributions = toContributions(features, weights);
      const projectedScore = contributions.reduce((sum, entry) => sum + entry.contribution, 0);
      const projectedPoints = Number((projectedScore * 10).toFixed(2));
      const chance = chanceOfFivePlusPoints(player.position, projectedPoints, features);

      return {
        ...player,
        projectedScore,
        projectedPoints,
        chanceOfFivePlusPoints: chance,
        contributions,
        explanation: buildPlayerExplanation({
          position: player.position,
          contributions,
        }),
      };
    })
    .sort((a, b) => b.projectedScore - a.projectedScore);
}