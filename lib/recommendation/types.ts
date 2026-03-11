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
  chanceOfPlayingNextRound: number | null;
  status: string;
  explanation: string;
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

export interface TeamImportView {
  status: "not_provided" | "success";
  teamId: string | null;
  sourceGameweek: number | null;
  importedPlayerIds: number[];
  importedPlayers: PlayerView[];
}

export interface RecommendData {
  nextGw: number;
  recommendation: RecommendationView;
  teamImport: TeamImportView;
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