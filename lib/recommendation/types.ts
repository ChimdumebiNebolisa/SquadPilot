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
  fivePlusProbability: number;
  /** Heuristic availability/start estimate, not a calibrated probability. */
  startEstimatePercent: number;
  expectedMinutes: number;
  fixtureCount: number;
  fixtureStatus: "scheduled";
  upcomingFixtures: Array<{
    fixtureId: number;
    event: number;
    opponentTeamId: number;
    opponentTeamCode: number;
    isHome: boolean;
    difficulty: number | null;
    kickoffTime: string | null;
  }>;
  opponentHistory: Array<{
    opponentTeamId: number;
    sampleSize: number;
    shrunkPointsPer90: number;
  }>;
  historicalSampleSize: number;
  historicalDataStatus: "available" | "partial" | "missing";
  dataSources: Array<"fpl-live" | "vaastav-historical" | "user-team">;
  chanceOfPlayingNextRound: number | null;
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
  startingXIIds: number[];
  benchIds: number[];
  captainId: number;
  viceCaptainId: number;
  projectedTotal: number;
  budgetUsed: number;
  solver: {
    mode: "solver" | "fallback";
    status: string;
  };
}

export interface FreshnessView {
  state: "fresh" | "stale" | "degraded";
  sources: {
    bootstrap: { state: "fresh" | "stale"; fetchedAt: string; ageSeconds: number };
    fixtures: { state: "fresh" | "stale"; fetchedAt: string; ageSeconds: number };
    history: { state: "fresh" | "degraded"; status: "available" | "partial" | "missing" };
    team?: { state: "fresh" | "stale"; fetchedAt: string; ageSeconds: number };
  };
}

export interface RecommendData {
  schemaVersion: 2;
  nextGw: number;
  fixtureStatus: "available";
  recommendation: RecommendationView;
  teams: Array<{ id: number; shortName: string; name: string }>;
  freshness: FreshnessView;
  scoring: {
    modelVersion: string;
    trainingSeason: string;
    validationSeason: string;
    fplExpectedPoints: "comparator-only";
    fivePlusMetric: {
      kind: "historically-calibrated-model-estimate";
      target: "total-gameweek-points-at-least-5";
      featureParity: "production-replay";
      availabilityTreatment: "reported-separately";
      doubleGameweekEvidence: "limited-sample";
      historyTreatment: "previous-season-player-and-opponent";
    };
  };
  userTeam?: {
    teamId: number;
    teamName: string | null;
    picksEvent: number | null;
    dataStatus: "available" | "partial";
    dataWarnings: string[];
    historyAvailable: boolean;
    picksAvailable: boolean;
    currentPlayers: Array<{
      playerId: number;
      webName: string;
      currentPoints: number;
      projectedPoints: number;
      startEstimatePercent: number;
    }>;
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
