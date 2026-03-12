export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Contribution {
  factor: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface PlayerView {
  id: number;
  webName: string;
  teamId: number;
  position: Position;
  price: number;
  projectedPoints: number;
  chanceOfFivePlusPoints: number;
  /** Deterministic % chance of starting next GW (0–100). */
  chanceOfStarting: number;
  chanceOfPlayingNextRound: number | null;
  status: string;
  explanation: {
    summary: string;
    whyPicked: string;
    mainRisk: string;
    confidence: "High" | "Medium" | "Low";
    tags: string[];
  };
  contributions: Contribution[];
}

export interface RecommendationView {
  squad: PlayerView[];
  startingXI: PlayerView[];
  bench: PlayerView[];
  captain: PlayerView;
  viceCaptain: PlayerView;
  budgetUsed: number;
  solver: {
    mode: "solver" | "fallback";
    status: string;
  };
}

export interface RecommendData {
  nextGw: number;
  recommendation: RecommendationView;
  teams: Array<{
    id: number;
    shortName: string;
    name: string;
  }>;
}

export interface RecommendResponse {
  ok: true;
  data: RecommendData;
}

export interface RecommendErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    status?: number;
  };
}