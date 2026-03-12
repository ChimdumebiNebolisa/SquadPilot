import {
  type NormalizedFixture,
  type NormalizedPlayer,
  type NormalizedTeam,
  type PlayerPosition,
} from "@/lib/fpl/types";

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return toNumber(value, 0);
}

function toStringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  return fallback;
}

function mapElementTypeToPosition(elementType: number): PlayerPosition {
  if (elementType === 1) return "GK";
  if (elementType === 2) return "DEF";
  if (elementType === 3) return "MID";
  return "FWD";
}

export function resolveNextGameweek(bootstrapRaw: unknown): number {
  if (typeof bootstrapRaw !== "object" || bootstrapRaw === null) {
    throw new Error("Invalid bootstrap payload");
  }

  const payload = bootstrapRaw as { events?: unknown[] };
  const events = Array.isArray(payload.events) ? payload.events : [];

  for (const event of events) {
    if (typeof event === "object" && event !== null && "is_next" in event) {
      const maybeNext = event as { is_next?: unknown; id?: unknown };
      if (maybeNext.is_next === true) {
        const nextId = toNumber(maybeNext.id, 0);
        if (nextId > 0) {
          return nextId;
        }
      }
    }
  }

  for (const event of events) {
    if (typeof event === "object" && event !== null && "finished" in event) {
      const maybeEvent = event as { finished?: unknown; id?: unknown };
      if (maybeEvent.finished === false) {
        const nextId = toNumber(maybeEvent.id, 0);
        if (nextId > 0) {
          return nextId;
        }
      }
    }
  }

  const validIds = events
    .map((event) => (typeof event === "object" && event !== null ? toNumber((event as { id?: unknown }).id, 0) : 0))
    .filter((id) => id > 0)
    .sort((a, b) => a - b);

  if (validIds.length === 0) {
    throw new Error("Could not resolve next gameweek");
  }

  return validIds[0];
}

export function normalizeBootstrap(
  bootstrapRaw: unknown,
): { players: NormalizedPlayer[]; teams: NormalizedTeam[] } {
  if (typeof bootstrapRaw !== "object" || bootstrapRaw === null) {
    throw new Error("Invalid bootstrap payload");
  }

  const payload = bootstrapRaw as { elements?: unknown[]; teams?: unknown[] };
  const rawPlayers = Array.isArray(payload.elements) ? payload.elements : [];
  const rawTeams = Array.isArray(payload.teams) ? payload.teams : [];

  const players: NormalizedPlayer[] = rawPlayers
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const player = entry as Record<string, unknown>;
      const elementType = toNumber(player.element_type, 4);

      return {
        id: toNumber(player.id, 0),
        webName: toStringValue(player.web_name, "Unknown"),
        teamId: toNumber(player.team, 0),
        position: mapElementTypeToPosition(elementType),
        price: toNumber(player.now_cost, 0) / 10,
        form: toNumber(player.form, 0),
        pointsPerGame: toNumber(player.points_per_game, 0),
        selectedByPercent: toNumber(player.selected_by_percent, 0),
        status: toStringValue(player.status, "u"),
        chanceOfPlayingNextRound: toNullableNumber(player.chance_of_playing_next_round),
        epNext: toNumber(player.ep_next, 0),
        ictIndex: toNumber(player.ict_index, 0),
      };
    })
    .filter((player) => player.id > 0 && player.teamId > 0);

  const teams: NormalizedTeam[] = rawTeams
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const team = entry as Record<string, unknown>;

      return {
        id: toNumber(team.id, 0),
        name: toStringValue(team.name, "Unknown Team"),
        shortName: toStringValue(team.short_name, "UNK"),
        strength: toNullableNumber(team.strength_overall_home),
      };
    })
    .filter((team) => team.id > 0);

  return { players, teams };
}

export function normalizeFixtures(fixturesRaw: unknown): NormalizedFixture[] {
  if (!Array.isArray(fixturesRaw)) {
    return [];
  }

  return fixturesRaw
    .filter((entry) => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const fixture = entry as Record<string, unknown>;
      return {
        id: toNumber(fixture.id, 0),
        event: toNumber(fixture.event, 0),
        teamH: toNumber(fixture.team_h, 0),
        teamA: toNumber(fixture.team_a, 0),
        teamHDifficulty: toNullableNumber(fixture.team_h_difficulty),
        teamADifficulty: toNullableNumber(fixture.team_a_difficulty),
      };
    })
    .filter((fixture) => fixture.id > 0 && fixture.event > 0);
}