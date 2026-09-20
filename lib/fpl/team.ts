import type { DataProvenance } from "@/lib/data/types";
import type { CurrentUserTeam } from "@/lib/fpl/types";

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function provenance(asOf: string): DataProvenance {
  return {
    source: "user-team",
    season: "current",
    gameweek: null,
    fixtureId: null,
    asOf,
    confidence: "high",
    availability: "available",
  };
}

export function normalizeCurrentUserTeam(
  teamId: number,
  entryRaw: unknown,
  historyRaw: unknown,
  picksRaw: unknown,
  asOf = new Date().toISOString(),
): CurrentUserTeam {
  const entry = typeof entryRaw === "object" && entryRaw !== null ? entryRaw as Record<string, unknown> : {};
  const picks = typeof picksRaw === "object" && picksRaw !== null ? picksRaw as Record<string, unknown> : {};
  const rawPicks = Array.isArray(picks.picks) ? picks.picks : [];
  const entryHistory = typeof picks.entry_history === "object" && picks.entry_history !== null
    ? picks.entry_history as Record<string, unknown>
    : {};

  const source = provenance(asOf);
  const squad = rawPicks
    .filter((pick): pick is Record<string, unknown> => typeof pick === "object" && pick !== null)
    .map((pick) => ({
      playerId: Number(pick.element ?? 0),
      position: Number(pick.position ?? 0),
      multiplier: Number(pick.multiplier ?? 0),
      isCaptain: pick.is_captain === true,
      isViceCaptain: pick.is_vice_captain === true,
      source,
    }))
    .filter((pick) => pick.playerId > 0);

  const historyAvailable = typeof historyRaw === "object" && historyRaw !== null && Array.isArray((historyRaw as { current?: unknown }).current);
  const eventFromPicks = numberOrNull(picks.event);
  const freeTransfers = numberOrNull(entryHistory.free_transfers ?? entryHistory.free_transfers_available);

  return {
    source,
    teamId,
    teamName: typeof entry.name === "string" ? entry.name : null,
    currentEvent: eventFromPicks ?? numberOrNull(entry.current_event),
    squad,
    bank: numberOrNull(entryHistory.bank),
    teamValue: numberOrNull(entryHistory.value ?? entry.value),
    freeTransfers,
    transfersMade: numberOrNull(entryHistory.event_transfers),
    historyAvailable,
    picksAvailable: squad.length > 0,
  };
}
