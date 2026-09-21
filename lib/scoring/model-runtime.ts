import type { PlayerPosition } from "@/lib/fpl/types";
import type {
  FivePlusFeature,
  FivePlusFeatureVector,
  ModelFeature,
  ModelFeatureVector,
} from "@/lib/scoring/model-features";

export interface CalibrationPoint {
  threshold: number;
  value: number;
}

export interface PositionModel {
  intercept: number;
  coefficients: Record<ModelFeature, number>;
  pointsCalibration: CalibrationPoint[];
  recentFormBlend: number;
  fivePlus: {
    intercept: number;
    coefficients: Record<FivePlusFeature, number>;
    calibration: CalibrationPoint[];
  };
}

export interface ScoringModelArtifact {
  features: readonly ModelFeature[];
  fivePlusFeatures: readonly FivePlusFeature[];
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

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

/** Exact prediction path used by both the production scorer and holdout evaluation. */
export function predictWithModelArtifact(
  artifact: ScoringModelArtifact,
  position: PlayerPosition,
  features: ModelFeatureVector,
  fivePlusFeatures: FivePlusFeatureVector,
  fixtureCount: number,
): { projectedPoints: number; fivePlusProbability: number } {
  const model = artifact.models[position];
  const rawPerFixture = clamp(
    model.intercept + artifact.features.reduce(
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
  const rawFivePlusProbability = sigmoid(
    model.fivePlus.intercept + artifact.fivePlusFeatures.reduce(
      (sum, feature) => sum + model.fivePlus.coefficients[feature] * fivePlusFeatures[feature],
      0,
    ),
  );
  return {
    projectedPoints: Number((blendedPerFixture * fixtureCount).toFixed(1)),
    fivePlusProbability: Number((clamp(
      calibrate(
        fixtureCount > 1 && artifact.doubleGameweekFivePlusCalibration?.length
          ? artifact.doubleGameweekFivePlusCalibration
          : model.fivePlus.calibration,
        rawFivePlusProbability,
      ),
    ) * 100).toFixed(1)),
  };
}
