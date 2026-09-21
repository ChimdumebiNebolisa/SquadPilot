export const MODEL_FEATURES = [
  "recentForm",
  "pointsPerGame",
  "expectedMinutes",
  "fixtureDifficulty",
  "homeAway",
  "value",
  "historicalVsOpponent",
] as const;

export type ModelFeature = (typeof MODEL_FEATURES)[number];
export type ModelFeatureVector = Record<ModelFeature, number>;

export interface ModelFeatureInput {
  recentPointsPerMatch: number;
  pointsPerGame: number;
  expectedMinutesFraction: number;
  averageFixtureDifficulty: number;
  homeFixtureFraction: number;
  price: number;
  historicalOpponentRatio: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Shared production/backtest normalization for every model input. */
export function buildModelFeatures(input: ModelFeatureInput): ModelFeatureVector {
  return {
    recentForm: clamp(input.recentPointsPerMatch / 10),
    pointsPerGame: clamp(input.pointsPerGame / 10),
    expectedMinutes: clamp(input.expectedMinutesFraction),
    fixtureDifficulty: clamp((5 - input.averageFixtureDifficulty) / 4),
    homeAway: clamp(input.homeFixtureFraction),
    value: input.price > 0 ? clamp((input.pointsPerGame / input.price) / 1.2) : 0,
    historicalVsOpponent: clamp(input.historicalOpponentRatio),
  };
}
