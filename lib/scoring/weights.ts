import type { ScoringWeights } from "@/lib/scoring/types";

export const V1_FIXED_WEIGHTS: ScoringWeights = {
  version: "v1.0.0",
  recentForm: 0.16,
  pointsPerGame: 0.2,
  expectedMinutes: 0.2,
  fixtureDifficulty: 0.12,
  homeAway: 0.05,
  opponentStrength: 0.07,
  value: 0.1,
  differential: 0.03,
  health: 0.07,
  setPiece: 0,
  historicalVsOpponent: 0,
};