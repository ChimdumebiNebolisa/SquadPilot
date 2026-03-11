import type { FactorContribution } from "@/lib/scoring/types";

const FACTOR_LABELS: Record<string, string> = {
  recentForm: "recent form",
  pointsPerGame: "points-per-game output",
  expectedMinutes: "minutes reliability",
  fixtureDifficulty: "fixture context",
  homeAway: "home advantage",
  opponentStrength: "opponent profile",
  value: "price efficiency",
  differential: "differential upside",
  health: "availability",
  setPiece: "set-piece potential",
  historicalVsOpponent: "historical matchup",
};

export function buildPlayerExplanation(contributions: FactorContribution[]): string {
  const topContributions = contributions
    .filter((item) => Math.abs(item.contribution) > 0.001)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);

  if (topContributions.length === 0) {
    return "Projection is neutral with no dominant factor signal.";
  }

  const labels = topContributions.map((item) => FACTOR_LABELS[item.factor] ?? item.factor);

  if (labels.length === 1) {
    return `Projection is supported mainly by ${labels[0]}.`;
  }

  if (labels.length === 2) {
    return `Projection is supported by ${labels[0]} and ${labels[1]}.`;
  }

  return `Projection is supported by ${labels[0]}, ${labels[1]}, and ${labels[2]}.`;
}