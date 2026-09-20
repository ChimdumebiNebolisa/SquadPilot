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
  source: DataSource,
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
      source: provenance(source, season, null, null, asOf),
      playerId,
      playerName: playerRecords.find((record) => record.playerName)?.playerName ?? null,
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
      source: provenance(source, season, null, null, asOf),
      playerId,
      playerName: opponentRecords.find((record) => record.playerName)?.playerName ?? null,
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
  source: DataSource = "vaastav-historical",
): HistoricalDataset {
  const performances = rows
    .map((row) => {
      const playerId = numberValue(row.element);
      const fixtureId = numberValue(row.fixture);
      const gameweek = numberValue(row.round);
      if (playerId <= 0 || fixtureId <= 0 || gameweek <= 0) return null;
      if (row.position === "5" || row.position === 5 || row.element_type === "5" || row.element_type === 5) return null;
      const opponentTeamId = nullableNumber(row.opponent_team);
      const availability: DataAvailability = opponentTeamId == null ? "partial" : "available";
      return {
        source: provenance(source, season, gameweek, fixtureId, asOf, availability),
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

  const aggregates = aggregatePerformance(performances, season, asOf, source);
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
  const current = normalizeVaastavRows(rows, season, asOf, "fpl-live");
  const historyPast = Array.isArray((payload as { history_past?: unknown[] }).history_past)
    ? (payload as { history_past: unknown[] }).history_past
    : [];
  const pastAggregates = historyPast
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map((row) => {
      const pastSeason = typeof row.season_name === "string" ? row.season_name : typeof row.season === "string" ? row.season : "unknown";
      const minutes = numberValue(row.minutes);
      const totalPoints = numberValue(row.total_points);
      return {
        source: provenance("fpl-live", pastSeason, null, null, asOf),
        playerId: elementId,
        playerName: null,
        season: pastSeason,
        matches: numberValue(row.matches_played ?? row.matches ?? row.gameweeks_played),
        starts: numberValue(row.starts),
        minutes,
        totalPoints,
        goals: numberValue(row.goals_scored),
        assists: numberValue(row.assists),
        pointsPer90: minutes > 0 ? (totalPoints / minutes) * 90 : 0,
        homeMatches: 0,
        awayMatches: 0,
      } satisfies PlayerSeasonAggregate;
    });
  return { ...current, seasonAggregates: [...current.seasonAggregates, ...pastAggregates] };
}

export function lookupOpponentHistory(
  dataset: HistoricalDataset | null,
  playerId: number,
  opponentTeamId: number,
  baselinePointsPer90: number | null,
  playerName?: string | null,
): PlayerOpponentAggregate | null {
  const normalizedName = normalizePlayerName(playerName);
  const idRecords = dataset?.opponentAggregates.filter((aggregate) => aggregate.playerId === playerId && aggregate.opponentTeamId === opponentTeamId) ?? [];
  const records = idRecords.length > 0
    ? idRecords
    : dataset?.opponentAggregates.filter((aggregate) =>
      aggregate.opponentTeamId === opponentTeamId && normalizedName !== null && normalizePlayerName(aggregate.playerName) === normalizedName,
    ) ?? [];
  if (!records.length) return null;
  const record = records[0];
  const usedNameFallback = idRecords.length === 0;
  const minutes = records.reduce((sum, item) => sum + item.minutes, 0);
  const totalPoints = records.reduce((sum, item) => sum + item.totalPoints, 0);
  const sampleSize = records.reduce((sum, item) => sum + item.sampleSize, 0);
  const shrinkWeight = sampleSize / (sampleSize + 4);
  const pointsPer90 = minutes > 0 ? (totalPoints / minutes) * 90 : 0;
  return {
    ...record,
    playerId,
    source: usedNameFallback ? { ...record.source, confidence: "low" } : record.source,
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

function normalizePlayerName(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || null;
}
