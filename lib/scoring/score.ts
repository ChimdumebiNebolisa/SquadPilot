import type { NormalizedFixture, NormalizedPlayer, NormalizedTeam } from "@/lib/fpl/types";
import { extractFeaturesForPlayer } from "@/lib/scoring/features";
import { buildPlayerExplanation } from "@/lib/scoring/explain";
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
  weights: ScoringWeights,
): ProjectedPlayer[] {
  return players
    .map((player) => {
      const features = extractFeaturesForPlayer(player, teams, fixtures);
      const contributions = toContributions(features, weights);
      const projectedScore = contributions.reduce((sum, entry) => sum + entry.contribution, 0);

      return {
        ...player,
        projectedScore,
        projectedPoints: Number((projectedScore * 10).toFixed(2)),
        contributions,
        explanation: buildPlayerExplanation({
          position: player.position,
          contributions,
        }),
      };
    })
    .sort((a, b) => b.projectedScore - a.projectedScore);
}