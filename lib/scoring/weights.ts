import type { PlayerPosition } from "@/lib/fpl/types";
import type { ScoringWeights } from "@/lib/scoring/types";

/** Base weights; position overrides applied in getWeightsForPosition. */
const BASE_WEIGHTS: ScoringWeights = {
  version: "v2.0.0",
  recentForm: 0.13,
  pointsPerGame: 0.16,
  expectedMinutes: 0.16,
  fixtureDifficulty: 0.12,
  homeAway: 0.04,
  opponentStrength: 0.06,
  value: 0.08,
  differential: 0.02,
  health: 0.08,
  setPiece: 0.04,
  historicalVsOpponent: 0.05,
  historicalBaseline: 0.04,
  // ep_next is returned as a comparator and is intentionally not added again to the score.
  fplExpectedPoints: 0,
  attackingUpside: 0,
};

/** GK: lower emphasis on minutes/value (reduces bias), FPL EP in. */
const GK_WEIGHTS: Partial<ScoringWeights> = {
  expectedMinutes: 0.14,
  value: 0.06,
  fplExpectedPoints: 0,
  attackingUpside: 0,
};

/** DEF: balance floor and fixture; no attacking upside. */
const DEF_WEIGHTS: Partial<ScoringWeights> = {
  expectedMinutes: 0.14,
  fixtureDifficulty: 0.14,
  fplExpectedPoints: 0,
  attackingUpside: 0,
};

/** MID: stronger form and FPL EP, add attacking upside. */
const MID_WEIGHTS: Partial<ScoringWeights> = {
  recentForm: 0.15,
  fplExpectedPoints: 0,
  attackingUpside: 0.06,
};

/** FWD: strongest FPL EP and attacking upside. */
const FWD_WEIGHTS: Partial<ScoringWeights> = {
  recentForm: 0.15,
  fplExpectedPoints: 0,
  attackingUpside: 0.06,
};

const POSITION_OVERRIDES: Record<PlayerPosition, Partial<ScoringWeights>> = {
  GK: GK_WEIGHTS,
  DEF: DEF_WEIGHTS,
  MID: MID_WEIGHTS,
  FWD: FWD_WEIGHTS,
};

const NUMERIC_WEIGHT_KEYS: Array<keyof Omit<ScoringWeights, "version">> = [
  "recentForm", "pointsPerGame", "expectedMinutes", "fixtureDifficulty", "homeAway",
  "opponentStrength", "value", "differential", "health", "setPiece", "historicalVsOpponent", "historicalBaseline",
  "fplExpectedPoints", "attackingUpside",
];

export function getWeightsForPosition(position: PlayerPosition): ScoringWeights {
  const overrides = POSITION_OVERRIDES[position];
  const w = { ...BASE_WEIGHTS };
  if (overrides) {
    for (const k of NUMERIC_WEIGHT_KEYS) {
      const v = overrides[k];
      if (typeof v === "number") w[k] = v;
    }
  }
  return w;
}

/** Weights version string for API response. */
export const SCORING_WEIGHTS_VERSION = "v2.0.0";
