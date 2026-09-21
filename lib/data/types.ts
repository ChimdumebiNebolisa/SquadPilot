export type DataSource = "fpl-live" | "vaastav-historical" | "user-team";

export type DataAvailability = "available" | "partial" | "missing" | "provisional";

export type DataConfidence = "high" | "medium" | "low";

/** Provenance attached to every normalized record. */
export interface DataProvenance {
  source: DataSource;
  season: string;
  gameweek: number | null;
  fixtureId: number | null;
  asOf: string;
  confidence: DataConfidence;
  availability: DataAvailability;
}

export interface PlayerMatchPerformance {
  source: DataProvenance;
  /** Season-local FPL element id. Never use this across seasons. */
  sourcePlayerId: number;
  /** Stable FPL player code used for cross-season identity. */
  playerCode: number;
  playerName: string | null;
  position: string | null;
  sourceTeamId: number | null;
  teamCode: number | null;
  sourceOpponentTeamId: number | null;
  opponentTeamCode: number | null;
  wasHome: boolean | null;
  minutes: number;
  starts: number;
  totalPoints: number;
  goals: number;
  assists: number;
  expectedGoals: number | null;
  expectedAssists: number | null;
}

export interface PlayerSeasonAggregate {
  source: DataProvenance;
  playerCode: number;
  playerName: string | null;
  season: string;
  matches: number;
  starts: number;
  minutes: number;
  totalPoints: number;
  goals: number;
  assists: number;
  pointsPer90: number;
  homeMatches: number;
  awayMatches: number;
}

export interface PlayerOpponentAggregate {
  source: DataProvenance;
  playerCode: number;
  playerName: string | null;
  opponentTeamCode: number;
  matches: number;
  starts: number;
  minutes: number;
  totalPoints: number;
  pointsPer90: number;
  shrunkPointsPer90: number;
  homeMatches: number;
  awayMatches: number;
  sampleSize: number;
  dataStatus: DataAvailability;
}
