import type {
  DataAvailability,
  DataProvenance,
  DataSource,
  PlayerMatchPerformance,
  PlayerOpponentAggregate,
  PlayerSeasonAggregate,
} from "@/lib/data/types";

export interface HistoricalDataset {
  performances: PlayerMatchPerformance[];
  seasonAggregates: PlayerSeasonAggregate[];
  opponentAggregates: PlayerOpponentAggregate[];
  seasonByPlayerCode: ReadonlyMap<number, PlayerSeasonAggregate[]>;
  opponentByPlayerAndTeamCode: ReadonlyMap<string, PlayerOpponentAggregate[]>;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullablePositiveInteger(value: unknown): number | null {
  const parsed = numberValue(value, Number.NaN);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function boolValue(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return null;
}

function provenance(
  source: DataProvenance["source"],
  season: string,
  gameweek: number | null,
  fixtureId: number | null,
  asOf: string,
  availability: DataAvailability = "available",
): DataProvenance {
  return {
    source,
    season,
    gameweek,
    fixtureId,
    asOf,
    confidence: availability === "available" ? "high" : "low",
    availability,
  };
}

export function indexHistoricalDataset(
  performances: PlayerMatchPerformance[],
  seasonAggregates: PlayerSeasonAggregate[],
  opponentAggregates: PlayerOpponentAggregate[],
): HistoricalDataset {
  const seasonByPlayerCode = new Map<number, PlayerSeasonAggregate[]>();
  const opponentByPlayerAndTeamCode = new Map<string, PlayerOpponentAggregate[]>();

  for (const aggregate of seasonAggregates) {
    const records = seasonByPlayerCode.get(aggregate.playerCode) ?? [];
    records.push(aggregate);
    seasonByPlayerCode.set(aggregate.playerCode, records);
  }
  for (const aggregate of opponentAggregates) {
    const key = `${aggregate.playerCode}:${aggregate.opponentTeamCode}`;
    const records = opponentByPlayerAndTeamCode.get(key) ?? [];
    records.push(aggregate);
    opponentByPlayerAndTeamCode.set(key, records);
  }
  for (const records of seasonByPlayerCode.values()) {
    records.sort((left, right) => right.season.localeCompare(left.season));
  }

  return { performances, seasonAggregates, opponentAggregates, seasonByPlayerCode, opponentByPlayerAndTeamCode };
}

function aggregatePerformances(
  records: PlayerMatchPerformance[],
  season: string,
  asOf: string,
  source: DataSource,
): HistoricalDataset {
  const byPlayer = new Map<number, PlayerMatchPerformance[]>();
  const byOpponent = new Map<string, PlayerMatchPerformance[]>();

  for (const record of records) {
    const playerRecords = byPlayer.get(record.playerCode) ?? [];
    playerRecords.push(record);
    byPlayer.set(record.playerCode, playerRecords);
    if (record.opponentTeamCode != null) {
      const key = `${record.playerCode}:${record.opponentTeamCode}`;
      const opponentRecords = byOpponent.get(key) ?? [];
      opponentRecords.push(record);
      byOpponent.set(key, opponentRecords);
    }
  }

  const seasonAggregates = [...byPlayer.entries()].map(([playerCode, playerRecords]) => {
    const minutes = playerRecords.reduce((sum, record) => sum + record.minutes, 0);
    const totalPoints = playerRecords.reduce((sum, record) => sum + record.totalPoints, 0);
    return {
      source: provenance(source, season, null, null, asOf),
      playerCode,
      playerName: playerRecords.find((record) => record.playerName)?.playerName ?? null,
      season,
      matches: playerRecords.length,
      starts: playerRecords.reduce((sum, record) => sum + record.starts, 0),
      minutes,
      totalPoints,
      goals: playerRecords.reduce((sum, record) => sum + record.goals, 0),
      assists: playerRecords.reduce((sum, record) => sum + record.assists, 0),
      pointsPer90: minutes > 0 ? totalPoints / minutes * 90 : 0,
      homeMatches: playerRecords.filter((record) => record.wasHome === true).length,
      awayMatches: playerRecords.filter((record) => record.wasHome === false).length,
    } satisfies PlayerSeasonAggregate;
  });
  const baselineByPlayer = new Map(seasonAggregates.map((aggregate) => [aggregate.playerCode, aggregate.pointsPer90]));

  const opponentAggregates = [...byOpponent.entries()].map(([key, opponentRecords]) => {
    const [playerCodeText, opponentTeamCodeText] = key.split(":");
    const playerCode = Number(playerCodeText);
    const opponentTeamCode = Number(opponentTeamCodeText);
    const minutes = opponentRecords.reduce((sum, record) => sum + record.minutes, 0);
    const totalPoints = opponentRecords.reduce((sum, record) => sum + record.totalPoints, 0);
    const pointsPer90 = minutes > 0 ? totalPoints / minutes * 90 : 0;
    const sampleSize = opponentRecords.length;
    const shrinkWeight = sampleSize / (sampleSize + 4);
    const baseline = baselineByPlayer.get(playerCode) ?? 0;
    return {
      source: provenance(source, season, null, null, asOf),
      playerCode,
      playerName: opponentRecords.find((record) => record.playerName)?.playerName ?? null,
      opponentTeamCode,
      matches: sampleSize,
      starts: opponentRecords.reduce((sum, record) => sum + record.starts, 0),
      minutes,
      totalPoints,
      pointsPer90,
      shrunkPointsPer90: pointsPer90 * shrinkWeight + baseline * (1 - shrinkWeight),
      homeMatches: opponentRecords.filter((record) => record.wasHome === true).length,
      awayMatches: opponentRecords.filter((record) => record.wasHome === false).length,
      sampleSize,
      dataStatus: "available" as const,
    } satisfies PlayerOpponentAggregate;
  });

  return indexHistoricalDataset(records, seasonAggregates, opponentAggregates);
}

/** Normalize rows that already contain stable player/team codes from the pinned importer. */
export function normalizeVaastavRows(
  rows: Array<Record<string, unknown>>,
  season: string,
  asOf: string,
  source: DataSource = "vaastav-historical",
): HistoricalDataset {
  const performances = rows.map((row) => {
    const sourcePlayerId = nullablePositiveInteger(row.element ?? row.sourcePlayerId);
    const playerCode = nullablePositiveInteger(row.player_code ?? row.playerCode ?? row.code);
    const fixtureId = nullablePositiveInteger(row.fixture);
    const gameweek = nullablePositiveInteger(row.round);
    if (sourcePlayerId == null || playerCode == null || fixtureId == null || gameweek == null) return null;
    if (row.position === "5" || row.position === 5 || row.element_type === "5" || row.element_type === 5) return null;
    const opponentTeamCode = nullablePositiveInteger(row.opponent_team_code ?? row.opponentTeamCode);
    const availability: DataAvailability = opponentTeamCode == null ? "partial" : "available";
    return {
      source: provenance(source, season, gameweek, fixtureId, asOf, availability),
      sourcePlayerId,
      playerCode,
      playerName: typeof row.name === "string" ? row.name : null,
      position: typeof row.position === "string" ? row.position : null,
      sourceTeamId: nullablePositiveInteger(row.team),
      teamCode: nullablePositiveInteger(row.team_code ?? row.teamCode),
      sourceOpponentTeamId: nullablePositiveInteger(row.opponent_team),
      opponentTeamCode,
      wasHome: boolValue(row.was_home),
      minutes: numberValue(row.minutes),
      starts: numberValue(row.starts),
      totalPoints: numberValue(row.total_points),
      goals: numberValue(row.goals_scored),
      assists: numberValue(row.assists),
      expectedGoals: row.expected_goals == null || row.expected_goals === "" ? null : numberValue(row.expected_goals),
      expectedAssists: row.expected_assists == null || row.expected_assists === "" ? null : numberValue(row.expected_assists),
    } satisfies PlayerMatchPerformance;
  }).filter((record): record is PlayerMatchPerformance => record !== null);

  return aggregatePerformances(performances, season, asOf, source);
}

export function lookupOpponentHistory(
  dataset: HistoricalDataset | null,
  playerCode: number,
  opponentTeamCode: number,
  baselinePointsPer90: number | null,
): PlayerOpponentAggregate | null {
  const records = dataset?.opponentByPlayerAndTeamCode.get(`${playerCode}:${opponentTeamCode}`) ?? [];
  if (records.length === 0) return null;
  const record = records[0];
  const minutes = records.reduce((sum, item) => sum + item.minutes, 0);
  const totalPoints = records.reduce((sum, item) => sum + item.totalPoints, 0);
  const sampleSize = records.reduce((sum, item) => sum + item.sampleSize, 0);
  const shrinkWeight = sampleSize / (sampleSize + 4);
  const pointsPer90 = minutes > 0 ? totalPoints / minutes * 90 : 0;
  return {
    ...record,
    playerCode,
    matches: sampleSize,
    starts: records.reduce((sum, item) => sum + item.starts, 0),
    minutes,
    totalPoints,
    pointsPer90,
    sampleSize,
    shrunkPointsPer90: pointsPer90 * shrinkWeight + (baselinePointsPer90 ?? record.shrunkPointsPer90) * (1 - shrinkWeight),
    dataStatus: "available",
  };
}

export function lookupOpponentHistoryForSeason(
  dataset: HistoricalDataset | null,
  playerCode: number,
  opponentTeamCode: number,
  season: string,
): PlayerOpponentAggregate | null {
  return dataset?.opponentByPlayerAndTeamCode
    .get(`${playerCode}:${opponentTeamCode}`)
    ?.find((record) => record.source.season === season) ?? null;
}

export function seasonAggregate(
  dataset: HistoricalDataset | null,
  playerCode: number,
  season: string,
): PlayerSeasonAggregate | null {
  return dataset?.seasonByPlayerCode.get(playerCode)?.find((record) => record.season === season) ?? null;
}

export function latestSeasonAggregate(dataset: HistoricalDataset | null, playerCode: number): PlayerSeasonAggregate | null {
  return dataset?.seasonByPlayerCode.get(playerCode)?.[0] ?? null;
}
