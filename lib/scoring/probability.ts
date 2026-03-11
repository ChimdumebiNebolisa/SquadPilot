import type { PlayerFeatureVector } from "@/lib/scoring/types";

type Position = "GK" | "DEF" | "MID" | "FWD";

const FIVE_POINT_THRESHOLD = 5;

interface PositionProfile {
  thresholdShift: number;
  projectedDivisor: number;
  baselineAdjustment: number;
  minPercent: number;
  maxPercent: number;
}

const POSITION_PROFILES: Record<Position, PositionProfile> = {
  GK: {
    thresholdShift: 0.55,
    projectedDivisor: 1.25,
    baselineAdjustment: -0.2,
    minPercent: 6,
    maxPercent: 82,
  },
  DEF: {
    thresholdShift: 0.3,
    projectedDivisor: 1.2,
    baselineAdjustment: -0.12,
    minPercent: 7,
    maxPercent: 86,
  },
  MID: {
    thresholdShift: -0.12,
    projectedDivisor: 1.05,
    baselineAdjustment: 0.1,
    minPercent: 10,
    maxPercent: 93,
  },
  FWD: {
    thresholdShift: 0,
    projectedDivisor: 1.08,
    baselineAdjustment: 0.06,
    minPercent: 9,
    maxPercent: 92,
  },
};

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function chanceOfFivePlusPoints(position: Position, projectedPoints: number, features: PlayerFeatureVector): number {
  const profile = POSITION_PROFILES[position];
  const projectedSignal = (projectedPoints - (FIVE_POINT_THRESHOLD + profile.thresholdShift)) / profile.projectedDivisor;
  const minutesSignal = (features.expectedMinutes - 0.65) * 1.1;
  const fixtureSignal = (features.fixtureDifficulty - 0.5) * 0.8;
  const formSignal = (features.recentForm - 0.5) * 0.75;
  const healthSignal = (features.health - 0.7) * 0.85;
  const valueSignal = (features.value - 0.5) * 0.25;
  const reliabilitySignal = (features.pointsPerGame - 0.45) * 0.35;

  const raw =
    projectedSignal +
    minutesSignal +
    fixtureSignal +
    formSignal +
    healthSignal +
    valueSignal +
    reliabilitySignal +
    profile.baselineAdjustment;

  const probability = sigmoid(raw);
  const boundedPercent = clamp(probability * 100, profile.minPercent, profile.maxPercent);

  return Number(boundedPercent.toFixed(1));
}
