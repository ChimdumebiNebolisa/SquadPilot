import type { PlayerPosition } from "@/lib/fpl/types";
import { MODEL_FEATURES, type ModelFeature, type ModelFeatureVector } from "@/lib/scoring/model-features";

export interface CalibrationPoint {
  threshold: number;
  value: number;
}

export interface PositionModel {
  intercept: number;
  coefficients: Record<ModelFeature, number>;
  pointsCalibration: CalibrationPoint[];
  fivePlusCalibration: CalibrationPoint[];
  recentFormBlend: number;
}

export interface ScoringModelArtifact {
  features: readonly ModelFeature[];
  models: Record<PlayerPosition, PositionModel>;
  doubleGameweekFivePlusCalibration?: CalibrationPoint[];
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function calibrate(points: CalibrationPoint[], value: number): number {
  if (points.length === 0) return value;
  if (value <= points[0].threshold) return points[0].value;
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (value > right.threshold) continue;
    const left = points[index - 1];
    if (right.threshold === left.threshold) return right.value;
    const progress = (value - left.threshold) / (right.threshold - left.threshold);
    return left.value + progress * (right.value - left.value);
  }
  return points.at(-1)?.value ?? value;
}

/** Exact prediction path used by both the production scorer and holdout evaluation. */
export function predictWithModelArtifact(
  artifact: ScoringModelArtifact,
  position: PlayerPosition,
  features: ModelFeatureVector,
  fixtureCount: number,
): { projectedPoints: number; fivePlusProbability: number } {
  const model = artifact.models[position];
  const rawPerFixture = clamp(
    model.intercept + MODEL_FEATURES.reduce(
      (sum, feature) => sum + model.coefficients[feature] * features[feature],
      0,
    ),
    0,
    15,
  );
  const calibratedPerFixture = calibrate(model.pointsCalibration, rawPerFixture);
  const blendedPerFixture = clamp(
    calibratedPerFixture * (1 - model.recentFormBlend)
      + features.recentForm * 10 * model.recentFormBlend,
    0,
    15,
  );
  return {
    projectedPoints: Number((blendedPerFixture * fixtureCount).toFixed(1)),
    fivePlusProbability: Number((clamp(
      calibrate(
        fixtureCount > 1 && artifact.doubleGameweekFivePlusCalibration?.length
          ? artifact.doubleGameweekFivePlusCalibration
          : model.fivePlusCalibration,
        rawPerFixture * fixtureCount,
      ),
    ) * 100).toFixed(1)),
  };
}
