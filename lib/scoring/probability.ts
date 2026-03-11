import type { PlayerFeatureVector } from "@/lib/scoring/types";

type Position = "GK" | "DEF" | "MID" | "FWD";

const FIVE_POINT_THRESHOLD = 5;

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function positionAdjustment(position: Position): number {
  if (position === "MID") return 0.12;
  if (position === "FWD") return 0.08;
  if (position === "DEF") return -0.04;
  return -0.1;
}

export function chanceOfFivePlusPoints(position: Position, projectedPoints: number, features: PlayerFeatureVector): number {
  const projectedSignal = (projectedPoints - FIVE_POINT_THRESHOLD) / 1.3;
  const minutesSignal = (features.expectedMinutes - 0.65) * 1.05;
  const fixtureSignal = (features.fixtureDifficulty - 0.5) * 0.95;
  const formSignal = (features.recentForm - 0.5) * 0.7;
  const healthSignal = (features.health - 0.7) * 0.9;
  const valueSignal = (features.value - 0.5) * 0.35;

  const raw =
    projectedSignal +
    minutesSignal +
    fixtureSignal +
    formSignal +
    healthSignal +
    valueSignal +
    positionAdjustment(position);

  const probability = sigmoid(raw);
  const boundedPercent = clamp(probability * 100, 8, 92);

  return Number(boundedPercent.toFixed(1));
}
