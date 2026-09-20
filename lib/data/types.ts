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
  playerId: number;
  playerName: string | null;
  position: string | null;
  teamId: number | null;
  opponentTeamId: number | null;
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
  playerId: number;
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
  playerId: number;
  playerName: string | null;
  opponentTeamId: number;
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
