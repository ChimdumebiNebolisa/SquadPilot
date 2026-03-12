import { NextResponse } from "next/server";
import { FplHttpError, fetchBootstrapStatic, fetchFixturesForEvent } from "@/lib/fpl/fetchers";
import type { NormalizedFixture } from "@/lib/fpl/types";
import { normalizeBootstrap, normalizeFixtures, resolveGameweeksPlayed, resolveNextGameweek } from "@/lib/fpl/normalize";
import { scorePlayers } from "@/lib/scoring/score";
import { SCORING_WEIGHTS_VERSION } from "@/lib/scoring/weights";
import type { ProjectedPlayer } from "@/lib/scoring/types";
import { buildRecommendation } from "@/lib/solver/recommend";
import { checkRateLimit } from "@/lib/server/rate-limit";

function setOpponentTeamIds(
  recommendation: { squad: ProjectedPlayer[]; startingXI: ProjectedPlayer[]; bench: ProjectedPlayer[]; captain: ProjectedPlayer; viceCaptain: ProjectedPlayer },
  fixtures: NormalizedFixture[],
): void {
  const byTeam = new Map<number, number>();
  for (const f of fixtures) {
    byTeam.set(f.teamH, f.teamA);
    byTeam.set(f.teamA, f.teamH);
  }
  const seen = new Set<number>();
  for (const p of recommendation.squad) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const opponent = byTeam.get(p.teamId);
    (p as ProjectedPlayer & { opponentTeamId?: number | null }).opponentTeamId = opponent ?? null;
  }
}

export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const clientKey = forwardedFor?.split(",")[0]?.trim() || "local";
    const rateLimit = checkRateLimit(clientKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please retry shortly.",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const bootstrapRaw = await fetchBootstrapStatic();
    const nextGw = resolveNextGameweek(bootstrapRaw);
    const fixturesRaw = await fetchFixturesForEvent(nextGw);

    const { players, teams } = normalizeBootstrap(bootstrapRaw);
    const gameweeksPlayed = resolveGameweeksPlayed(bootstrapRaw);
    const fixtures = normalizeFixtures(fixturesRaw);
    const projectedPlayers = scorePlayers(players, teams, fixtures, gameweeksPlayed);
    const recommendation = buildRecommendation(projectedPlayers);
    setOpponentTeamIds(recommendation, fixtures);

    return NextResponse.json({
      ok: true,
      data: {
        nextGw,
        players,
        projectedPlayers,
        recommendation,
        scoring: {
          weightsVersion: SCORING_WEIGHTS_VERSION,
        },
        teams,
        fixtures,
      },
    });
  } catch (error) {
    if (error instanceof FplHttpError) {
      if (error.status === 429) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              message: "FPL rate limited this request. Please retry shortly.",
              status: error.status,
            },
          },
          { status: 429 },
        );
      }

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