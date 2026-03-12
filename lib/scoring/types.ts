import type { NormalizedPlayer } from "@/lib/fpl/types";

export interface PlayerFeatureVector {
  recentForm: number;
  pointsPerGame: number;
  expectedMinutes: number;
  fixtureDifficulty: number;
  homeAway: number;
  opponentStrength: number;
  value: number;
  differential: number;
  health: number;
  setPiece: number;
  historicalVsOpponent: number;
  /** FPL's expected points next GW, normalized 0–1 (scale 0–15). */
  fplExpectedPoints: number;
  /** Attacking upside from ICT index; 0 for GK/DEF, normalized for MID/FWD. */
  attackingUpside: number;
}

export interface ScoringWeights {
  version: string;
  recentForm: number;
  pointsPerGame: number;
  expectedMinutes: number;
  fixtureDifficulty: number;
  homeAway: number;
  opponentStrength: number;
  value: number;
  differential: number;
  health: number;
  setPiece: number;
  historicalVsOpponent: number;
  fplExpectedPoints: number;
  attackingUpside: number;
}

export interface FactorContribution {
  factor: keyof PlayerFeatureVector;
  value: number;
  weight: number;
  contribution: number;
}

export interface PlayerExplanation {
  summary: string;
  whyPicked: string;
  mainRisk: string;
  confidence: "High" | "Medium" | "Low";
  tags: string[];
}

export interface ProjectedPlayer extends NormalizedPlayer {
  projectedScore: number;
  projectedPoints: number;
  chanceOfFivePlusPoints: number;
  /** Deterministic % chance of starting next GW (0–100), from availability + minutes history. */
  chanceOfStarting: number;
  /** Next-GW opponent team id (set when building response). */
  opponentTeamId?: number | null;
  contributions: FactorContribution[];
  explanation: PlayerExplanation;
}