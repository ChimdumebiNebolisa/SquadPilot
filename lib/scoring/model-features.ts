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

export const FIVE_PLUS_FEATURES = [
  "seasonPointsPerFixture",
  "minutesPerTeamFixture",
  "fixtureDifficulty",
  "homeAway",
  "value",
  "fixtureCount",
] as const;

export type FivePlusFeature = (typeof FIVE_PLUS_FEATURES)[number];
export type FivePlusFeatureVector = Record<FivePlusFeature, number>;

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

export interface FivePlusFeatureInput {
  seasonPointsPerFixture: number;
  minutesPerTeamFixtureFraction: number;
  averageFixtureDifficulty: number;
  homeFixtureFraction: number;
  price: number;
  fixtureCount: number;
}

export interface FivePlusReplayInput {
  totalPoints: number;
  minutes: number;
  completedTeamFixtures: number;
  averageFixtureDifficulty: number;
  homeFixtureFraction: number;
  price: number;
  fixtureCount: number;
}

/** Inputs that can be reproduced from pre-gameweek records and live FPL totals. */
export function buildFivePlusFeatures(input: FivePlusFeatureInput): FivePlusFeatureVector {
  return {
    seasonPointsPerFixture: clamp(input.seasonPointsPerFixture / 10),
    minutesPerTeamFixture: clamp(input.minutesPerTeamFixtureFraction),
    fixtureDifficulty: clamp((5 - input.averageFixtureDifficulty) / 4),
    homeAway: clamp(input.homeFixtureFraction),
    value: input.price > 0 ? clamp((input.seasonPointsPerFixture / input.price) / 1.2) : 0,
    fixtureCount: clamp(input.fixtureCount / 2),
  };
}

/** Shared pre-gameweek state builder used by live scoring and historical replay. */
export function buildFivePlusReplayFeatures(input: FivePlusReplayInput): FivePlusFeatureVector {
  const completedTeamFixtures = Math.max(1, input.completedTeamFixtures);
  return buildFivePlusFeatures({
    seasonPointsPerFixture: input.totalPoints / completedTeamFixtures,
    minutesPerTeamFixtureFraction: input.minutes / completedTeamFixtures / 90,
    averageFixtureDifficulty: input.averageFixtureDifficulty,
    homeFixtureFraction: input.homeFixtureFraction,
    price: input.price,
    fixtureCount: input.fixtureCount,
  });
}
