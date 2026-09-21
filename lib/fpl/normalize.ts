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
  if (elementType === 4) return "FWD";
  throw new FplSchemaError(`Unsupported FPL element_type ${elementType}.`);
}

export class FplSchemaError extends Error {}
export class SeasonCompleteError extends Error {}

function requiredPositiveInteger(value: unknown, field: string): number {
  const parsed = toNumber(value, Number.NaN);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new FplSchemaError(`Invalid ${field}.`);
  return parsed;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new FplSchemaError(`Invalid ${field}.`);
  return value;
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
  if (typeof bootstrapRaw !== "object" || bootstrapRaw === null) throw new FplSchemaError("Invalid bootstrap payload.");
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
  if (events.length > 0) throw new SeasonCompleteError("The FPL season has no remaining gameweek.");
  throw new FplSchemaError("Bootstrap payload has no events.");
}

export function resolvePicksEventCandidates(bootstrapRaw: unknown, now = Date.now()): number[] {
  if (typeof bootstrapRaw !== "object" || bootstrapRaw === null) throw new FplSchemaError("Invalid bootstrap payload.");
  const events = (bootstrapRaw as { events?: unknown }).events;
  if (!Array.isArray(events)) throw new FplSchemaError("Bootstrap payload has no events.");
  return events
    .flatMap((event) => {
      if (typeof event !== "object" || event === null) return [];
      const value = event as { id?: unknown; deadline_time?: unknown };
      const id = toNumber(value.id, 0);
      const deadline = typeof value.deadline_time === "string" ? Date.parse(value.deadline_time) : Number.NaN;
      return id > 0 && Number.isFinite(deadline) && deadline <= now ? [id] : [];
    })
    .sort((left, right) => right - left);
}

export function normalizeBootstrap(
  bootstrapRaw: unknown,
  asOf = new Date().toISOString(),
): { players: NormalizedPlayer[]; teams: NormalizedTeam[] } {
  if (typeof bootstrapRaw !== "object" || bootstrapRaw === null) throw new FplSchemaError("Invalid bootstrap payload.");
  const payload = bootstrapRaw as { elements?: unknown[]; teams?: unknown[] };
  if (!Array.isArray(payload.elements) || !Array.isArray(payload.teams)) {
    throw new FplSchemaError("Bootstrap payload is missing elements or teams.");
  }
  const rawPlayers = payload.elements;
  const rawTeams = payload.teams;

  const players = rawPlayers
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) throw new FplSchemaError("Invalid player record.");
      const player = entry as Record<string, unknown>;
      const elementType = requiredPositiveInteger(player.element_type, "player.element_type");
      const priceTenths = toNumber(player.now_cost, Number.NaN);
      if (!Number.isFinite(priceTenths) || priceTenths < 0) throw new FplSchemaError("Invalid player.now_cost.");
      return {
        source: liveProvenance(asOf),
        id: requiredPositiveInteger(player.id, "player.id"),
        code: requiredPositiveInteger(player.code, "player.code"),
        webName: requiredString(player.web_name, "player.web_name"),
        firstName: requiredString(player.first_name, "player.first_name"),
        lastName: requiredString(player.second_name, "player.second_name"),
        teamId: requiredPositiveInteger(player.team, "player.team"),
        teamCode: requiredPositiveInteger(player.team_code, "player.team_code"),
        position: mapElementTypeToPosition(elementType),
        price: priceTenths / 10,
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
    });

  const teams = rawTeams
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) throw new FplSchemaError("Invalid team record.");
      const team = entry as Record<string, unknown>;
      return {
        source: liveProvenance(asOf),
        id: requiredPositiveInteger(team.id, "team.id"),
        code: requiredPositiveInteger(team.code, "team.code"),
        name: requiredString(team.name, "team.name"),
        shortName: requiredString(team.short_name, "team.short_name"),
        strength: toNullablePositiveNumber(team.strength),
        strengthOverallHome: toNullablePositiveNumber(team.strength_overall_home),
        strengthOverallAway: toNullablePositiveNumber(team.strength_overall_away),
        strengthAttackHome: toNullablePositiveNumber(team.strength_attack_home),
        strengthAttackAway: toNullablePositiveNumber(team.strength_attack_away),
        strengthDefenceHome: toNullablePositiveNumber(team.strength_defence_home),
        strengthDefenceAway: toNullablePositiveNumber(team.strength_defence_away),
      } satisfies NormalizedTeam;
    });

  const teamById = new Map<number, NormalizedTeam>();
  const teamCodes = new Set<number>();
  for (const team of teams) {
    if (teamById.has(team.id) || teamCodes.has(team.code)) throw new FplSchemaError("Bootstrap contains duplicate team identity.");
    teamById.set(team.id, team);
    teamCodes.add(team.code);
  }
  const playerIds = new Set<number>();
  const playerCodes = new Set<number>();
  for (const player of players) {
    if (playerIds.has(player.id) || playerCodes.has(player.code)) throw new FplSchemaError("Bootstrap contains duplicate player identity.");
    const team = teamById.get(player.teamId);
    if (!team || team.code !== player.teamCode) throw new FplSchemaError("Player team identity does not match the team table.");
    playerIds.add(player.id);
    playerCodes.add(player.code);
  }

  return { players, teams };
}

export function normalizeFixtures(fixturesRaw: unknown, asOf = new Date().toISOString()): NormalizedFixture[] {
  if (!Array.isArray(fixturesRaw) || fixturesRaw.length === 0) {
    throw new FplSchemaError("Fixture payload is missing or empty.");
  }

  return fixturesRaw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) throw new FplSchemaError("Invalid fixture record.");
      const fixture = entry as Record<string, unknown>;
      const event = toNullableNumber(fixture.event);
      const provisional = toBoolean(fixture.finished_provisional);
      return {
        source: {
          ...liveProvenance(asOf, event === null ? "partial" : "available"),
          gameweek: event,
          fixtureId: toNumber(fixture.id) || null,
        },
        id: requiredPositiveInteger(fixture.id, "fixture.id"),
        event,
        kickoffTime: typeof fixture.kickoff_time === "string" ? fixture.kickoff_time : null,
        teamH: requiredPositiveInteger(fixture.team_h, "fixture.team_h"),
        teamA: requiredPositiveInteger(fixture.team_a, "fixture.team_a"),
        teamHDifficulty: toNullableNumber(fixture.team_h_difficulty),
        teamADifficulty: toNullableNumber(fixture.team_a_difficulty),
        finished: toBoolean(fixture.finished),
        finishedProvisional: provisional,
      } satisfies NormalizedFixture;
    });
}
