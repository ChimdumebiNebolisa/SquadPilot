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
  contributions: FactorContribution[];
  explanation: PlayerExplanation;
}