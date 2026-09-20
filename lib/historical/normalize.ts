import type {
  DataAvailability,
  DataProvenance,
  PlayerMatchPerformance,
  PlayerOpponentAggregate,
  PlayerSeasonAggregate,
} from "@/lib/data/types";

export interface HistoricalDataset {
  performances: PlayerMatchPerformance[];
  seasonAggregates: PlayerSeasonAggregate[];
  opponentAggregates: PlayerOpponentAggregate[];
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
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

function aggregatePerformance(
  records: PlayerMatchPerformance[],
  season: string,
  asOf: string,
): { seasonAggregates: PlayerSeasonAggregate[]; opponentAggregates: PlayerOpponentAggregate[] } {
  const byPlayer = new Map<number, PlayerMatchPerformance[]>();
  const byOpponent = new Map<string, PlayerMatchPerformance[]>();

  for (const record of records) {
    const playerRecords = byPlayer.get(record.playerId) ?? [];
    playerRecords.push(record);
    byPlayer.set(record.playerId, playerRecords);

    if (record.opponentTeamId != null) {
      const key = `${record.playerId}:${record.opponentTeamId}`;
      const opponentRecords = byOpponent.get(key) ?? [];
      opponentRecords.push(record);
      byOpponent.set(key, opponentRecords);
    }
  }

  const seasonAggregates = [...byPlayer.entries()].map(([playerId, playerRecords]) => {
    const minutes = playerRecords.reduce((sum, record) => sum + record.minutes, 0);
    return {
      source: provenance("vaastav-historical", season, null, null, asOf),
      playerId,
      season,
      matches: playerRecords.length,
      starts: playerRecords.reduce((sum, record) => sum + record.starts, 0),
      minutes,
      totalPoints: playerRecords.reduce((sum, record) => sum + record.totalPoints, 0),
      goals: playerRecords.reduce((sum, record) => sum + record.goals, 0),
      assists: playerRecords.reduce((sum, record) => sum + record.assists, 0),
      pointsPer90: minutes > 0 ? (playerRecords.reduce((sum, record) => sum + record.totalPoints, 0) / minutes) * 90 : 0,
      homeMatches: playerRecords.filter((record) => record.wasHome === true).length,
      awayMatches: playerRecords.filter((record) => record.wasHome === false).length,
    } satisfies PlayerSeasonAggregate;
  });

  const opponentAggregates = [...byOpponent.entries()].map(([key, opponentRecords]) => {
    const [playerIdText, opponentTeamIdText] = key.split(":");
    const playerId = Number(playerIdText);
    const opponentTeamId = Number(opponentTeamIdText);
    const minutes = opponentRecords.reduce((sum, record) => sum + record.minutes, 0);
    const totalPoints = opponentRecords.reduce((sum, record) => sum + record.totalPoints, 0);
    const pointsPer90 = minutes > 0 ? (totalPoints / minutes) * 90 : 0;
    const baseline = seasonAggregates.find((aggregate) => aggregate.playerId === playerId)?.pointsPer90 ?? 0;
    const sampleSize = opponentRecords.length;
    const shrinkWeight = sampleSize / (sampleSize + 4);
    return {
      source: provenance("vaastav-historical", season, null, null, asOf),
      playerId,
      opponentTeamId,
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

  return { seasonAggregates, opponentAggregates };
}

/** Normalize Vaastav merged_gw rows without joining players by display name. */
export function normalizeVaastavRows(
  rows: Array<Record<string, unknown>>,
  season: string,
  asOf = new Date().toISOString(),
): HistoricalDataset {
  const performances = rows
    .map((row) => {
      const playerId = numberValue(row.element);
      const fixtureId = numberValue(row.fixture);
      const gameweek = numberValue(row.round);
      if (playerId <= 0 || fixtureId <= 0 || gameweek <= 0) return null;
      const opponentTeamId = nullableNumber(row.opponent_team);
      const availability: DataAvailability = opponentTeamId == null ? "partial" : "available";
      return {
        source: provenance("vaastav-historical", season, gameweek, fixtureId, asOf, availability),
        playerId,
        playerName: typeof row.name === "string" ? row.name : null,
        position: typeof row.position === "string" ? row.position : null,
        teamId: nullableNumber(row.team),
        opponentTeamId,
        wasHome: boolValue(row.was_home),
        minutes: numberValue(row.minutes),
        // The dataset's `starts` field is used when present. Do not infer starts from minutes.
        starts: numberValue(row.starts),
        totalPoints: numberValue(row.total_points),
        goals: numberValue(row.goals_scored),
        assists: numberValue(row.assists),
        expectedGoals: nullableNumber(row.expected_goals),
        expectedAssists: nullableNumber(row.expected_assists),
      } satisfies PlayerMatchPerformance;
    })
    .filter((record): record is PlayerMatchPerformance => record !== null);

  const aggregates = aggregatePerformance(performances, season, asOf);
  return { performances, ...aggregates };
}

export function normalizeFplElementSummary(
  elementId: number,
  payload: unknown,
  season = "current",
  asOf = new Date().toISOString(),
): HistoricalDataset {
  if (typeof payload !== "object" || payload === null) {
    return { performances: [], seasonAggregates: [], opponentAggregates: [] };
  }
  const history = Array.isArray((payload as { history?: unknown[] }).history)
    ? (payload as { history: unknown[] }).history
    : [];
  const rows = history.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null).map((row) => ({
    ...row,
    element: elementId,
    starts: row.starts ?? 0,
  }));
  return normalizeVaastavRows(rows, season, asOf);
}

export function lookupOpponentHistory(
  dataset: HistoricalDataset | null,
  playerId: number,
  opponentTeamId: number,
  baselinePointsPer90: number | null,
): PlayerOpponentAggregate | null {
  const record = dataset?.opponentAggregates.find(
    (aggregate) => aggregate.playerId === playerId && aggregate.opponentTeamId === opponentTeamId,
  );
  if (!record) return null;
  const shrinkWeight = record.sampleSize / (record.sampleSize + 4);
  return {
    ...record,
    shrunkPointsPer90: record.pointsPer90 * shrinkWeight + (baselinePointsPer90 ?? record.shrunkPointsPer90) * (1 - shrinkWeight),
    dataStatus: "available",
  };
}
