import { NextResponse } from "next/server";
import { FplHttpError, fetchBootstrapStatic, fetchEntryPicks, fetchFixturesForEvent } from "@/lib/fpl/fetchers";
import {
  normalizeBootstrap,
  normalizeFixtures,
  normalizeTeamPicks,
  resolveCurrentGameweek,
  resolveNextGameweek,
} from "@/lib/fpl/normalize";
import type { TeamImportResult } from "@/lib/fpl/types";
import { scorePlayers } from "@/lib/scoring/score";
import { V1_FIXED_WEIGHTS } from "@/lib/scoring/weights";

const TEAM_ID_PATTERN = /^\d{1,10}$/;

function parseTeamId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  if (!TEAM_ID_PATTERN.test(normalized)) {
    throw new Error("Team ID must be numeric and up to 10 digits.");
  }

  return normalized;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { teamId?: unknown };
    const teamId = parseTeamId(body.teamId);

    const bootstrapRaw = await fetchBootstrapStatic();
    const nextGw = resolveNextGameweek(bootstrapRaw);
    const fixturesRaw = await fetchFixturesForEvent(nextGw);

    const { players, teams } = normalizeBootstrap(bootstrapRaw);
    const fixtures = normalizeFixtures(fixturesRaw);
    const projectedPlayers = scorePlayers(players, teams, fixtures, V1_FIXED_WEIGHTS);

    let teamImport: TeamImportResult = {
      status: "not_provided",
      teamId: null,
      sourceGameweek: null,
      importedPlayerIds: [],
      importedPlayers: [],
    };

    if (teamId !== null) {
      const currentGw = resolveCurrentGameweek(bootstrapRaw);
      const candidateGameweeks = [nextGw, currentGw, nextGw - 1].filter(
        (gw): gw is number => typeof gw === "number" && gw > 0,
      );

      let picksRaw: unknown = null;
      let selectedGw: number | null = null;

      for (const gameweek of candidateGameweeks) {
        try {
          picksRaw = await fetchEntryPicks(teamId, gameweek);
          selectedGw = gameweek;
          break;
        } catch (error) {
          if (error instanceof FplHttpError && error.status === 404) {
            continue;
          }

          throw error;
        }
      }

      if (picksRaw === null || selectedGw === null) {
        throw new FplHttpError(404, "Team picks unavailable for relevant gameweeks");
      }

      const importedPlayerIds = normalizeTeamPicks(picksRaw);
      const importedPlayerSet = new Set(importedPlayerIds);
      const importedPlayers = players.filter((player) => importedPlayerSet.has(player.id));

      teamImport = {
        status: "success",
        teamId,
        sourceGameweek: selectedGw,
        importedPlayerIds,
        importedPlayers,
      };
    }

    return NextResponse.json({
      ok: true,
      data: {
        nextGw,
        players,
        projectedPlayers,
        scoring: {
          weightsVersion: V1_FIXED_WEIGHTS.version,
        },
        teams,
        fixtures,
        teamImport,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Team ID must be")) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_TEAM_ID_FORMAT",
            message: error.message,
          },
        },
        { status: 400 },
      );
    }

    if (error instanceof FplHttpError && error.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_TEAM_ID",
            message: "The Team ID could not be found for this gameweek.",
          },
        },
        { status: 404 },
      );
    }

    if (error instanceof FplHttpError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: "FPL upstream data is currently unavailable.",
            status: error.status,
          },
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Unexpected failure while building recommendation payload.",
        },
      },
      { status: 500 },
    );
  }
}