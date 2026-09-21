import type { NormalizedPlayer, OpponentHistoryView, PlayerFixtureView } from "@/lib/fpl/types";

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
  historicalBaseline: number;
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
  historicalBaseline: number;
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
  /** Held-out calibrated probability from 0–100. */
  fivePlusProbability: number;
  /** Deterministic 0–100 start estimate, not a calibrated probability. */
  startEstimatePercent: number;
  expectedMinutes: number;
  fixtureCount: number;
  fixtureStatus: "scheduled";
  upcomingFixtures: PlayerFixtureView[];
  opponentTeamId?: number | null;
  opponentHistory: OpponentHistoryView[];
  historicalSampleSize: number;
  historicalDataStatus: "available" | "partial" | "missing";
  dataSources: Array<"fpl-live" | "vaastav-historical" | "user-team">;
  contributions: FactorContribution[];
  explanation: PlayerExplanation;
}
