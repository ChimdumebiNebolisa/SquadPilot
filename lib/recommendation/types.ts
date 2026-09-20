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
  totalPoints: number;
  projectedPoints: number;
  chanceOfFivePlusPoints: number;
  fivePlusPointsEstimate: number;
  /** Deterministic start estimate (0–100), not a calibrated probability. */
  chanceOfStarting: number;
  expectedMinutes: number;
  fixtureCount: number;
  upcomingFixtures: Array<{
    fixtureId: number;
    event: number;
    opponentTeamId: number;
    isHome: boolean;
    difficulty: number | null;
    kickoffTime: string | null;
    source: "fpl-live" | "vaastav-historical" | "user-team";
  }>;
  opponentHistory: Array<{
    opponentTeamId: number;
    matches: number;
    sampleSize: number;
    pointsPer90: number;
    shrunkPointsPer90: number;
    baselinePointsPer90: number | null;
    homeMatches: number;
    awayMatches: number;
  }>;
  historicalSampleSize: number;
  historicalDataStatus: "available" | "partial" | "missing";
  dataSources: Array<"fpl-live" | "vaastav-historical" | "user-team">;
  chanceOfPlayingNextRound: number | null;
  /** Next-GW opponent team id (for "vs XYZ" on pitch). */
  opponentTeamId?: number | null;
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
  freshness: {
    lastSuccessfulSync: string | null;
    stale: boolean;
    historicalStatus: "available" | "partial" | "missing";
  };
  userTeam?: {
    teamId: number;
    teamName: string | null;
    dataStatus: "available" | "partial";
    dataWarnings: string[];
    historyAvailable: boolean;
    picksAvailable: boolean;
    currentPlayers: Array<{ playerId: number; webName: string; currentPoints: number; projectedPoints: number; chanceOfStarting: number; }>;
    bank: number | null;
    freeTransfers: number | null;
    captainId: number | null;
    viceCaptainId: number | null;
    recommendedStartingXIIds: number[];
    recommendedCaptainId: number | null;
    recommendedViceCaptainId: number | null;
    weakPlayers: Array<{ playerId: number; webName: string; reason: string }>;
    comparison: { added: number[]; dropped: number[] };
  };
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
