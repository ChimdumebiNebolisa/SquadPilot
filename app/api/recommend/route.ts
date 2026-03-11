import { NextResponse } from "next/server";
import { FplHttpError, fetchBootstrapStatic, fetchFixturesForEvent } from "@/lib/fpl/fetchers";
import { normalizeBootstrap, normalizeFixtures, resolveNextGameweek } from "@/lib/fpl/normalize";
import { scorePlayers } from "@/lib/scoring/score";
import { V1_FIXED_WEIGHTS } from "@/lib/scoring/weights";
import { buildRecommendation } from "@/lib/solver/recommend";
import { checkRateLimit } from "@/lib/server/rate-limit";

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
    const fixtures = normalizeFixtures(fixturesRaw);
    const projectedPlayers = scorePlayers(players, teams, fixtures, V1_FIXED_WEIGHTS);
    const recommendation = buildRecommendation(projectedPlayers);

    return NextResponse.json({
      ok: true,
      data: {
        nextGw,
        players,
        projectedPlayers,
        recommendation,
        scoring: {
          weightsVersion: V1_FIXED_WEIGHTS.version,
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