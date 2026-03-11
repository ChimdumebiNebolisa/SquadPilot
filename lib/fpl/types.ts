export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";

export interface NormalizedPlayer {
  id: number;
  webName: string;
  teamId: number;
  position: PlayerPosition;
  price: number;
  form: number;
  pointsPerGame: number;
  status: string;
  chanceOfPlayingNextRound: number | null;
}

export interface NormalizedTeam {
  id: number;
  name: string;
  shortName: string;
  strength: number | null;
}

export interface NormalizedFixture {
  id: number;
  event: number;
  teamH: number;
  teamA: number;
  teamHDifficulty: number | null;
  teamADifficulty: number | null;
}

export interface TeamImportResult {
  status: "not_provided" | "success";
  teamId: string | null;
  sourceGameweek: number | null;
  importedPlayerIds: number[];
  importedPlayers: NormalizedPlayer[];
}

export interface NormalizedRecommendationData {
  nextGw: number;
  players: NormalizedPlayer[];
  teams: NormalizedTeam[];
  fixtures: NormalizedFixture[];
  teamImport: TeamImportResult;
}