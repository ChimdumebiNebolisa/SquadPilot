import type { PlayerMatchPerformance } from "@/lib/data/types";

/** Information available at a deadline; the evaluated gameweek is excluded. */
export function recordsAvailableBefore(
  records: PlayerMatchPerformance[],
  evaluatedGameweek: number,
): PlayerMatchPerformance[] {
  return records.filter((record) => (record.source.gameweek ?? Number.POSITIVE_INFINITY) < evaluatedGameweek);
}

export function recentPointsBefore(
  records: PlayerMatchPerformance[],
  playerId: number,
  evaluatedGameweek: number,
  window = 5,
): number[] {
  return recordsAvailableBefore(records, evaluatedGameweek)
    .filter((record) => record.playerId === playerId)
    .sort((left, right) => (left.source.gameweek ?? 0) - (right.source.gameweek ?? 0))
    .slice(-window)
    .map((record) => record.totalPoints);
}
