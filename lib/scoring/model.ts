import modelArtifact from "@/data/model/scoring-model.json";
import type { PlayerPosition } from "@/lib/fpl/types";
import type { ModelFeatureVector } from "@/lib/scoring/model-features";
import { predictWithModelArtifact, type ScoringModelArtifact } from "@/lib/scoring/model-runtime";
import type { PlayerFeatureVector } from "@/lib/scoring/types";

export function predictCalibratedProjection(
  position: PlayerPosition,
  features: PlayerFeatureVector,
  fixtureCount: number,
): { projectedPoints: number; fivePlusProbability: number } {
  return predictWithModelArtifact(
    modelArtifact as ScoringModelArtifact,
    position,
    features as ModelFeatureVector,
    fixtureCount,
  );
}

export const SCORING_MODEL_VERSION = modelArtifact.version;
export const SCORING_MODEL_TRAINING_SEASON = modelArtifact.trainingSeason;
export const SCORING_MODEL_VALIDATION_SEASON = modelArtifact.validationSeason;
