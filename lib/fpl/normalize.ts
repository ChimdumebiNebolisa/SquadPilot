import type { DataProvenance } from "@/lib/data/types";
import {
  type NormalizedFixture,
  type NormalizedPlayer,
  type NormalizedTeam,
  type PlayerPosition,
} from "@/lib/fpl/types";

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullablePositiveNumber(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function mapElementTypeToPosition(elementType: number): PlayerPosition {
  if (elementType === 1) return "GK";
  if (elementType === 2) return "DEF";
  if (elementType === 3) return "MID";
  return "FWD";
}

function liveProvenance(asOf: string, availability: DataProvenance["availability"] = "available"): DataProvenance {
  return {
    source: "fpl-live",
    season: "current",
    gameweek: null,
    fixtureId: null,
    asOf,
    confidence: availability === "available" ? "high" : "medium",
    availability,
  };
}

/** Number of finished or provisionally finished gameweeks in the current FPL snapshot. */
export function resolveGameweeksPlayed(bootstrapRaw: unknown): number {
  if (typeof bootstrapRaw !== "object" || bootstrapRaw === null) return 0;
  const events = Array.isArray((bootstrapRaw as { events?: unknown[] }).events)
    ? (bootstrapRaw as { events: unknown[] }).events
    : [];
  return events.filter((event) => {
    if (typeof event !== "object" || event === null) return false;
    const value = event as { finished?: unknown; finished_provisional?: unknown };
    return value.finished === true || value.finished_provisional === true;
  }).length;
}

export function resolveNextGameweek(bootstrapRaw: unknown): number {
  if (typeof bootstrapRaw !== "object" || bootstrapRaw === null) throw new Error("Invalid bootstrap payload");
  const events = Array.isArray((bootstrapRaw as { events?: unknown[] }).events)
    ? (bootstrapRaw as { events: unknown[] }).events
    : [];

  for (const event of events) {
    if (typeof event !== "object" || event === null) continue;
    const value = event as { is_next?: unknown; id?: unknown };
    const id = toNumber(value.id, 0);
    if (value.is_next === true && id > 0) return id;
  }

  const unfinishedIds = events
    .filter((event) => typeof event === "object" && event !== null)
    .filter((event) => {
      const value = event as { finished?: unknown; finished_provisional?: unknown };
      return value.finished !== true && value.finished_provisional !== true;
    })
    .map((event) => toNumber((event as { id?: unknown }).id, 0))
    .filter((id) => id > 0)
    .sort((a, b) => a - b);

  if (unfinishedIds[0]) return unfinishedIds[0];
  throw new Error("Could not resolve next gameweek");
}

export function normalizeBootstrap(
  bootstrapRaw: unknown,
  asOf = new Date().toISOString(),
): { players: NormalizedPlayer[]; teams: NormalizedTeam[] } {
  if (typeof bootstrapRaw !== "object" || bootstrapRaw === null) throw new Error("Invalid bootstrap payload");
  const payload = bootstrapRaw as { elements?: unknown[]; teams?: unknown[] };
  const rawPlayers = Array.isArray(payload.elements) ? payload.elements : [];
  const rawTeams = Array.isArray(payload.teams) ? payload.teams : [];

  const players = rawPlayers
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const player = entry as Record<string, unknown>;
      return {
        source: liveProvenance(asOf),
        id: toNumber(player.id),
        webName: toStringValue(player.web_name, "Unknown"),
        firstName: toStringValue(player.first_name),
        lastName: toStringValue(player.second_name),
        teamId: toNumber(player.team),
        position: mapElementTypeToPosition(toNumber(player.element_type, 4)),
        price: toNumber(player.now_cost) / 10,
        totalPoints: toNumber(player.total_points),
        form: toNumber(player.form),
        pointsPerGame: toNumber(player.points_per_game),
        selectedByPercent: toNumber(player.selected_by_percent),
        status: toStringValue(player.status, "u"),
        news: toStringValue(player.news),
        chanceOfPlayingNextRound: toNullableNumber(player.chance_of_playing_next_round),
        epNext: toNumber(player.ep_next),
        ictIndex: toNumber(player.ict_index),
        minutesPlayedSeason: toNumber(player.minutes),
        starts: toNumber(player.starts),
        goals: toNumber(player.goals_scored),
        assists: toNumber(player.assists),
        expectedGoals: toNullableNumber(player.expected_goals),
        expectedAssists: toNullableNumber(player.expected_assists),
        cornersAndIndirectFreeKicksOrder: toNullableNumber(player.corners_and_indirect_freekicks_order),
        directFreeKicksOrder: toNullableNumber(player.direct_freekicks_order),
        penaltiesOrder: toNullableNumber(player.penalties_order),
      } satisfies NormalizedPlayer;
    })
    .filter((player) => player.id > 0 && player.teamId > 0);

  const teams = rawTeams
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const team = entry as Record<string, unknown>;
      return {
        source: liveProvenance(asOf),
        id: toNumber(team.id),
        name: toStringValue(team.name, "Unknown Team"),
        shortName: toStringValue(team.short_name, "UNK"),
        strength: toNullablePositiveNumber(team.strength),
        strengthOverallHome: toNullablePositiveNumber(team.strength_overall_home),
        strengthOverallAway: toNullablePositiveNumber(team.strength_overall_away),
        strengthAttackHome: toNullablePositiveNumber(team.strength_attack_home),
        strengthAttackAway: toNullablePositiveNumber(team.strength_attack_away),
        strengthDefenceHome: toNullablePositiveNumber(team.strength_defence_home),
        strengthDefenceAway: toNullablePositiveNumber(team.strength_defence_away),
      } satisfies NormalizedTeam;
    })
    .filter((team) => team.id > 0);

  return { players, teams };
}

export function normalizeFixtures(fixturesRaw: unknown, asOf = new Date().toISOString()): NormalizedFixture[] {
  if (!Array.isArray(fixturesRaw)) return [];

  return fixturesRaw
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const fixture = entry as Record<string, unknown>;
      const event = toNullableNumber(fixture.event);
      const provisional = toBoolean(fixture.finished_provisional);
      return {
        source: {
          ...liveProvenance(asOf, event === null ? "partial" : "available"),
          gameweek: event,
          fixtureId: toNumber(fixture.id) || null,
        },
        id: toNumber(fixture.id),
        event,
        kickoffTime: typeof fixture.kickoff_time === "string" ? fixture.kickoff_time : null,
        teamH: toNumber(fixture.team_h),
        teamA: toNumber(fixture.team_a),
        teamHDifficulty: toNullableNumber(fixture.team_h_difficulty),
        teamADifficulty: toNullableNumber(fixture.team_a_difficulty),
        finished: toBoolean(fixture.finished),
        finishedProvisional: provisional,
      } satisfies NormalizedFixture;
    })
    .filter((fixture) => fixture.id > 0 && fixture.teamH > 0 && fixture.teamA > 0);
}
