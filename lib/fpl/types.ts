import type { DataProvenance, PlayerOpponentAggregate } from "@/lib/data/types";

export type PlayerPosition = "GK" | "DEF" | "MID" | "FWD";

export interface NormalizedPlayer {
  source: DataProvenance;
  id: number;
  code: number;
  webName: string;
  firstName: string;
  lastName: string;
  teamId: number;
  teamCode: number;
  position: PlayerPosition;
  price: number;
  totalPoints: number;
  form: number;
  pointsPerGame: number;
  selectedByPercent: number;
  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;
  epNext: number;
  ictIndex: number;
  minutesPlayedSeason: number;
  starts: number;
  goals: number;
  assists: number;
  expectedGoals: number | null;
  expectedAssists: number | null;
  cornersAndIndirectFreeKicksOrder: number | null;
  directFreeKicksOrder: number | null;
  penaltiesOrder: number | null;
}

export interface NormalizedTeam {
  source: DataProvenance;
  id: number;
  code: number;
  name: string;
  shortName: string;
  strength: number | null;
  strengthOverallHome: number | null;
  strengthOverallAway: number | null;
  strengthAttackHome: number | null;
  strengthAttackAway: number | null;
  strengthDefenceHome: number | null;
  strengthDefenceAway: number | null;
}

export interface NormalizedFixture {
  source: DataProvenance;
  id: number;
  event: number | null;
  kickoffTime: string | null;
  teamH: number;
  teamA: number;
  teamHDifficulty: number | null;
  teamADifficulty: number | null;
  finished: boolean;
  finishedProvisional: boolean;
}

export interface PlayerFixtureView {
  fixtureId: number;
  event: number;
  opponentTeamId: number;
  opponentTeamCode: number;
  isHome: boolean;
  difficulty: number | null;
  kickoffTime: string | null;
  source: DataProvenance["source"];
}

export interface CurrentTeamPlayer {
  playerId: number;
  position: number;
  multiplier: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  source: DataProvenance;
}

export interface CurrentUserTeam {
  source: DataProvenance;
  teamId: number;
  teamName: string | null;
  currentEvent: number | null;
  squad: CurrentTeamPlayer[];
  bank: number | null;
  teamValue: number | null;
  freeTransfers: number | null;
  transfersMade: number | null;
  historyAvailable: boolean;
  picksAvailable: boolean;
}

export interface OpponentHistoryView extends PlayerOpponentAggregate {
  opponentTeamId: number;
  baselinePointsPer90: number | null;
}
