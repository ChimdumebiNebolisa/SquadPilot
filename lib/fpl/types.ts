export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";

export interface NormalizedPlayer {
  id: number;
  webName: string;
  teamId: number;
  position: PlayerPosition;
  price: number;
  form: number;
  pointsPerGame: number;
  selectedByPercent: number;
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