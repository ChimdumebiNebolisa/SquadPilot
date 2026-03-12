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
  /** FPL's expected points for next gameweek (from API ep_next). */
  epNext: number;
  /** ICT index from API (influence + creativity + threat); used for attacking upside. */
  ictIndex: number;
  /** Total minutes played this season (from API). Used for expected minutes projection. */
  minutesPlayedSeason: number;
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