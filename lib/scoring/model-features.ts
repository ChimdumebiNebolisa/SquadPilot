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

export const BASE_FIVE_PLUS_FEATURES = [
  "seasonPointsPerFixture",
  "minutesPerTeamFixture",
  "fixtureDifficulty",
  "homeAway",
  "value",
  "fixtureCount",
] as const;

export const PLAYER_HISTORY_FIVE_PLUS_FEATURES = [
  ...BASE_FIVE_PLUS_FEATURES,
  "previousSeasonPointsPer90",
  "previousSeasonPointsPerFixture",
  "previousSeasonMinutesShare",
  "previousSeasonSampleStrength",
  "previousSeasonAvailable",
  "historyAdjustedPointsPerFixture",
] as const;

export const FIVE_PLUS_FEATURES = [
  ...PLAYER_HISTORY_FIVE_PLUS_FEATURES,
  "opponentHistoryPointsPer90",
  "opponentHistorySampleStrength",
  "opponentHistoryCoverage",
] as const;

export const HISTORICAL_FIVE_PLUS_FEATURES = [
  "previousSeasonPointsPer90",
  "previousSeasonPointsPerFixture",
  "previousSeasonMinutesShare",
  "previousSeasonSampleStrength",
  "previousSeasonAvailable",
  "historyAdjustedPointsPerFixture",
  "opponentHistoryPointsPer90",
  "opponentHistorySampleStrength",
  "opponentHistoryCoverage",
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
  previousSeasonPointsPer90: number;
  previousSeasonPointsPerFixture: number;
  previousSeasonMinutesShare: number;
  previousSeasonSampleStrength: number;
  previousSeasonAvailable: number;
  historyAdjustedPointsPerFixture: number;
  opponentHistoryPointsPer90: number;
  opponentHistorySampleStrength: number;
  opponentHistoryCoverage: number;
}

export interface FivePlusPreviousSeasonInput {
  pointsPer90: number;
  minutes: number;
  totalPoints: number;
  matches: number;
}

export interface FivePlusOpponentHistoryInput {
  shrunkPointsPer90: number;
  sampleSize: number;
}

export interface FivePlusReplayInput {
  totalPoints: number;
  minutes: number;
  completedTeamFixtures: number;
  averageFixtureDifficulty: number;
  homeFixtureFraction: number;
  price: number;
  fixtureCount: number;
  previousSeason?: FivePlusPreviousSeasonInput | null;
  opponentHistory?: readonly FivePlusOpponentHistoryInput[];
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
    previousSeasonPointsPer90: clamp(input.previousSeasonPointsPer90 / 10),
    previousSeasonPointsPerFixture: clamp(input.previousSeasonPointsPerFixture / 10),
    previousSeasonMinutesShare: clamp(input.previousSeasonMinutesShare),
    previousSeasonSampleStrength: clamp(input.previousSeasonSampleStrength),
    previousSeasonAvailable: clamp(input.previousSeasonAvailable),
    historyAdjustedPointsPerFixture: clamp(input.historyAdjustedPointsPerFixture / 10),
    opponentHistoryPointsPer90: clamp(input.opponentHistoryPointsPer90 / 10),
    opponentHistorySampleStrength: clamp(input.opponentHistorySampleStrength),
    opponentHistoryCoverage: clamp(input.opponentHistoryCoverage),
  };
}

/** Shared pre-gameweek state builder used by live scoring and historical replay. */
export function buildFivePlusReplayFeatures(input: FivePlusReplayInput): FivePlusFeatureVector {
  const completedTeamFixtures = Math.max(1, input.completedTeamFixtures);
  const previousSeasonAvailable = input.previousSeason != null && input.previousSeason.minutes > 0;
  const previousSeasonMatches = Math.max(0, input.previousSeason?.matches ?? 0);
  const previousSeasonPointsPerFixture = previousSeasonMatches > 0
    ? (input.previousSeason?.totalPoints ?? 0) / previousSeasonMatches
    : 0;
  const previousSeasonMinutesShare = previousSeasonMatches > 0
    ? (input.previousSeason?.minutes ?? 0) / (previousSeasonMatches * 90)
    : 0;
  const previousSeasonSampleStrength = Math.min(1, previousSeasonMatches / 38);
  const effectivePriorFixtures = 6 * previousSeasonMinutesShare * previousSeasonSampleStrength;
  const historyAdjustedPointsPerFixture = previousSeasonAvailable
    ? (input.totalPoints + previousSeasonPointsPerFixture * effectivePriorFixtures)
      / (completedTeamFixtures + effectivePriorFixtures)
    : input.totalPoints / completedTeamFixtures;
  const opponentHistory = (input.opponentHistory ?? []).filter(
    (record) => Number.isFinite(record.shrunkPointsPer90) && record.sampleSize > 0,
  );
  const fixtureCount = Math.max(0, input.fixtureCount);
  const opponentHistoryPointsPer90 = opponentHistory.length > 0
    ? opponentHistory.reduce((sum, record) => sum + record.shrunkPointsPer90, 0) / opponentHistory.length
    : 0;
  const opponentHistorySampleStrength = fixtureCount > 0
    ? opponentHistory.reduce((sum, record) => sum + Math.min(6, record.sampleSize), 0) / (fixtureCount * 6)
    : 0;
  const opponentHistoryCoverage = fixtureCount > 0 ? opponentHistory.length / fixtureCount : 0;
  return buildFivePlusFeatures({
    seasonPointsPerFixture: input.totalPoints / completedTeamFixtures,
    minutesPerTeamFixtureFraction: input.minutes / completedTeamFixtures / 90,
    averageFixtureDifficulty: input.averageFixtureDifficulty,
    homeFixtureFraction: input.homeFixtureFraction,
    price: input.price,
    fixtureCount,
    previousSeasonPointsPer90: previousSeasonAvailable ? input.previousSeason?.pointsPer90 ?? 0 : 0,
    previousSeasonPointsPerFixture: previousSeasonAvailable ? previousSeasonPointsPerFixture : 0,
    previousSeasonMinutesShare: previousSeasonAvailable ? previousSeasonMinutesShare : 0,
    previousSeasonSampleStrength: previousSeasonAvailable ? previousSeasonSampleStrength : 0,
    previousSeasonAvailable: previousSeasonAvailable ? 1 : 0,
    historyAdjustedPointsPerFixture,
    opponentHistoryPointsPer90,
    opponentHistorySampleStrength,
    opponentHistoryCoverage,
  });
}
