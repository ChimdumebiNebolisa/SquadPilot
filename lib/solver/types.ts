import type { ProjectedPlayer } from "@/lib/scoring/types";

export interface RecommendationResult {
  squad: ProjectedPlayer[];
  startingXI: ProjectedPlayer[];
  bench: ProjectedPlayer[];
  captain: ProjectedPlayer;
  viceCaptain: ProjectedPlayer;
  budgetUsed: number;
  solver: {
    mode: "solver" | "fallback";
    status: string;
  };
}