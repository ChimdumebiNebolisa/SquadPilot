import { NextResponse } from "next/server";
import { getHistoricalAvailability, loadHistoricalDataset } from "@/lib/historical/store";
import {
  aggregateFreshness,
  FplHttpError,
  fetchBootstrapStatic,
  fetchEntry,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchFixtures,
  type SourceFreshness,
} from "@/lib/fpl/fetchers";
import {
  FplSchemaError,
  normalizeBootstrap,
  normalizeFixtures,
  resolveGameweeksPlayed,
  resolveNextGameweek,
  resolvePicksEventCandidates,
  SeasonCompleteError,
} from "@/lib/fpl/normalize";
import { normalizeCurrentUserTeam } from "@/lib/fpl/team";
import { scorePlayers } from "@/lib/scoring/score";
import {
  SCORING_MODEL_TRAINING_SEASON,
  SCORING_MODEL_VALIDATION_SEASON,
  SCORING_MODEL_VERSION,
} from "@/lib/scoring/model";
import { startOutlookLabel } from "@/lib/scoring/start-outlook";
import type { ProjectedPlayer } from "@/lib/scoring/types";
import type { PlayerView } from "@/lib/recommendation/types";
import { buildRecommendation, chooseBestStartingXI } from "@/lib/solver/recommend";

const MAX_REQUEST_BYTES = 1_024;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

class RequestValidationError extends Error {}

function errorResponse(code: string, message: string, status: number, upstreamStatus?: number) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(upstreamStatus ? { status: upstreamStatus } : {}) } },
    { status, headers: NO_STORE_HEADERS },
  );
}

async function parseRequest(request: Request): Promise<{ teamId?: number }> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestValidationError("Request body exceeds 1 KB.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new RequestValidationError("Request body exceeds 1 KB.");
  }
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new RequestValidationError("Request body must be valid JSON.");
    }
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new RequestValidationError("Request body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "teamId")) {
    throw new RequestValidationError("Only the optional teamId field is supported.");
  }
  if (!("teamId" in record)) return {};
  if (typeof record.teamId !== "number" || !Number.isSafeInteger(record.teamId) || record.teamId <= 0) {
    throw new RequestValidationError("teamId must be a positive integer.");
  }
  return { teamId: record.teamId };
}

function combineTeamFreshness(values: SourceFreshness[]): SourceFreshness | undefined {
  if (values.length === 0) return undefined;
  const oldest = [...values].sort((left, right) => right.ageSeconds - left.ageSeconds)[0];
  return {
    source: "team",
    state: values.some((value) => value.state === "stale") ? "stale" : "fresh",
    fetchedAt: oldest.fetchedAt,
    ageSeconds: oldest.ageSeconds,
  };
}

async function loadCurrentTeam(teamId: number, picksEvents: number[]) {
  const [entryResult, historyResult] = await Promise.allSettled([
    fetchEntry(teamId),
    fetchEntryHistory(teamId),
  ]);
  if (entryResult.status === "rejected") throw entryResult.reason;

  let picksRaw: unknown = null;
  let picksEvent: number | null = null;
  let picksError = false;
  const freshness = [entryResult.value.freshness];
  if (historyResult.status === "fulfilled") freshness.push(historyResult.value.freshness);

  for (const eventId of picksEvents) {
    try {
      const result = await fetchEntryPicks(teamId, eventId);
      picksRaw = result.value;
      picksEvent = eventId;
      freshness.push(result.freshness);
      break;
    } catch (error) {
      if (error instanceof FplHttpError && error.status === 404) continue;
      picksError = true;
      break;
    }
  }

  const team = normalizeCurrentUserTeam(
    teamId,
    entryResult.value.value,
    historyResult.status === "fulfilled" ? historyResult.value.value : null,
    picksRaw,
  );
  return {
    team,
    picksEvent,
    picksError,
    historyError: historyResult.status === "rejected",
    freshness: combineTeamFreshness(freshness),
  };
}

function toPlayerView(player: ProjectedPlayer): PlayerView {
  return {
    id: player.id,
    webName: player.webName,
    teamId: player.teamId,
    position: player.position,
    price: player.price,
    totalPoints: player.totalPoints,
    projectedPoints: player.projectedPoints,
    fivePlusProbability: player.fivePlusProbability,
    startEstimatePercent: player.startEstimatePercent,
    expectedMinutes: player.expectedMinutes,
    fixtureCount: player.fixtureCount,
    fixtureStatus: player.fixtureStatus,
    upcomingFixtures: player.upcomingFixtures.map((fixture) => ({
      fixtureId: fixture.fixtureId,
      event: fixture.event,
      opponentTeamId: fixture.opponentTeamId,
      opponentTeamCode: fixture.opponentTeamCode,
      isHome: fixture.isHome,
      difficulty: fixture.difficulty,
      kickoffTime: fixture.kickoffTime,
    })),
    opponentTeamId: player.opponentTeamId,
    opponentHistory: player.opponentHistory.map((history) => ({
      opponentTeamId: history.opponentTeamId,
      sampleSize: history.sampleSize,
      shrunkPointsPer90: history.shrunkPointsPer90,
    })),
    historicalSampleSize: player.historicalSampleSize,
    historicalDataStatus: player.historicalDataStatus,
    dataSources: player.dataSources,
    chanceOfPlayingNextRound: player.chanceOfPlayingNextRound,
    status: player.status,
    explanation: player.explanation,
    contributions: player.contributions,
  };
}

function buildUserTeamView(
  currentTeamResult: Awaited<ReturnType<typeof loadCurrentTeam>>,
  projectedPlayers: ProjectedPlayer[],
  recommendation: NonNullable<ReturnType<typeof buildRecommendation>>,
) {
  const currentTeam = currentTeamResult.team;
  const byId = new Map(projectedPlayers.map((player) => [player.id, player]));
  const currentPlayers = currentTeam.squad
    .map((pick) => byId.get(pick.playerId))
    .filter((player): player is ProjectedPlayer => player != null);
  const currentXI = chooseBestStartingXI(currentPlayers) ?? [];
  const recommendedCaptain = [...currentXI].sort((left, right) => right.projectedPoints - left.projectedPoints)[0] ?? null;
  const recommendedVice = [...currentXI]
    .filter((player) => player.id !== recommendedCaptain?.id)
    .sort((left, right) => right.projectedPoints - left.projectedPoints)[0] ?? null;
  const currentIds = new Set(currentPlayers.map((player) => player.id));
  const recommendedIds = new Set(recommendation.squad.map((player) => player.id));
  const comparisonAvailable = currentTeam.picksAvailable && !currentTeamResult.picksError;

  return {
    teamId: currentTeam.teamId,
    teamName: currentTeam.teamName,
    picksEvent: currentTeamResult.picksEvent,
    dataStatus: currentTeamResult.picksError || currentTeamResult.historyError || !currentTeam.picksAvailable
      ? "partial" as const
      : "available" as const,
    dataWarnings: [
      ...(currentTeamResult.picksError ? ["Squad picks could not be loaded from FPL."] : []),
      ...(currentTeamResult.historyError ? ["Team history could not be loaded from FPL."] : []),
      ...(!currentTeam.picksAvailable && !currentTeamResult.picksError ? ["No deadline-passed squad picks are available for this Team ID."] : []),
    ],
    historyAvailable: currentTeam.historyAvailable,
    picksAvailable: currentTeam.picksAvailable,
    currentPlayers: currentPlayers.map((player) => ({
      playerId: player.id,
      webName: player.webName,
      currentPoints: player.totalPoints,
      projectedPoints: player.projectedPoints,
      startEstimatePercent: player.startEstimatePercent,
    })),
    bank: currentTeam.bank,
    freeTransfers: currentTeam.freeTransfers,
    captainId: currentTeam.squad.find((pick) => pick.isCaptain)?.playerId ?? null,
    viceCaptainId: currentTeam.squad.find((pick) => pick.isViceCaptain)?.playerId ?? null,
    recommendedStartingXIIds: currentXI.map((player) => player.id),
    recommendedCaptainId: recommendedCaptain?.id ?? null,
    recommendedViceCaptainId: recommendedVice?.id ?? null,
    weakPlayers: currentPlayers
      .filter((player) => player.startEstimatePercent < 50)
      .sort((left, right) => left.startEstimatePercent - right.startEstimatePercent)
      .slice(0, 5)
      .map((player) => ({
        playerId: player.id,
        webName: player.webName,
        reason: startOutlookLabel(player.startEstimatePercent).toLowerCase(),
      })),
    comparison: {
      added: comparisonAvailable ? [...recommendedIds].filter((id) => !currentIds.has(id)) : [],
      dropped: comparisonAvailable ? [...currentIds].filter((id) => !recommendedIds.has(id)) : [],
    },
  };
}

export async function POST(request: Request) {
  try {
    const { teamId } = await parseRequest(request);
    const [bootstrapResult, fixturesResult] = await Promise.all([
      fetchBootstrapStatic(),
      fetchFixtures(),
    ]);
    const bootstrapRaw = bootstrapResult.value;
    const nextGw = resolveNextGameweek(bootstrapRaw);
    const { players, teams } = normalizeBootstrap(bootstrapRaw);
    let fixtures;
    try {
      fixtures = normalizeFixtures(fixturesResult.value);
    } catch (error) {
      if (error instanceof FplSchemaError) {
        return errorResponse("FIXTURE_DATA_UNAVAILABLE", "FPL fixture data is invalid or unavailable.", 502);
      }
      throw error;
    }

    let currentTeamResult: Awaited<ReturnType<typeof loadCurrentTeam>> | null = null;
    if (teamId != null) {
      try {
        currentTeamResult = await loadCurrentTeam(teamId, resolvePicksEventCandidates(bootstrapRaw));
      } catch {
        return errorResponse("TEAM_UNAVAILABLE", "The supplied Team ID could not be loaded from FPL.", 422);
      }
    }

    const historical = loadHistoricalDataset();
    const projectedPlayers = scorePlayers(players, teams, fixtures, resolveGameweeksPlayed(bootstrapRaw), {
      nextGameweek: nextGw,
      historical,
    });
    const recommendation = buildRecommendation(projectedPlayers);
    if (!recommendation) {
      return errorResponse("NO_FEASIBLE_SQUAD", "No legal 15-player squad fits the current data and £100m budget.", 422);
    }

    const historicalStatus = getHistoricalAvailability();
    const fetched = aggregateFreshness({
      bootstrap: bootstrapResult.freshness,
      fixtures: fixturesResult.freshness,
      team: currentTeamResult?.freshness,
    });
    const historyDegraded = historicalStatus.status !== "available";
    const teamDegraded = currentTeamResult != null
      && (currentTeamResult.picksError || currentTeamResult.historyError || !currentTeamResult.team.picksAvailable);
    const freshness = {
      state: historyDegraded || teamDegraded ? "degraded" as const : fetched.state,
      sources: {
        bootstrap: {
          state: bootstrapResult.freshness.state,
          fetchedAt: bootstrapResult.freshness.fetchedAt,
          ageSeconds: bootstrapResult.freshness.ageSeconds,
        },
        fixtures: {
          state: fixturesResult.freshness.state,
          fetchedAt: fixturesResult.freshness.fetchedAt,
          ageSeconds: fixturesResult.freshness.ageSeconds,
        },
        history: {
          state: historyDegraded ? "degraded" as const : "fresh" as const,
          status: historicalStatus.status,
        },
        ...(currentTeamResult?.freshness ? {
          team: {
            state: currentTeamResult.freshness.state,
            fetchedAt: currentTeamResult.freshness.fetchedAt,
            ageSeconds: currentTeamResult.freshness.ageSeconds,
          },
        } : {}),
      },
    };
    const userTeam = currentTeamResult
      ? buildUserTeamView(currentTeamResult, projectedPlayers, recommendation)
      : undefined;

    return NextResponse.json({
      ok: true,
      data: {
        schemaVersion: 2,
        nextGw,
        fixtureStatus: "available",
        recommendation: {
          squad: recommendation.squad.map(toPlayerView),
          startingXIIds: recommendation.startingXI.map((player) => player.id),
          benchIds: recommendation.bench.map((player) => player.id),
          captainId: recommendation.captain.id,
          viceCaptainId: recommendation.viceCaptain.id,
          projectedTotal: recommendation.projectedTotal,
          budgetUsed: recommendation.budgetUsed,
          solver: recommendation.solver,
        },
        teams: teams.map((team) => ({ id: team.id, shortName: team.shortName, name: team.name })),
        freshness,
        scoring: {
          modelVersion: SCORING_MODEL_VERSION,
          trainingSeason: SCORING_MODEL_TRAINING_SEASON,
          validationSeason: SCORING_MODEL_VALIDATION_SEASON,
          fplExpectedPoints: "comparator-only",
        },
        userTeam,
      },
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return errorResponse("VALIDATION_ERROR", error.message, 400);
    }
    if (error instanceof SeasonCompleteError) {
      return errorResponse("SEASON_COMPLETE", error.message, 409);
    }
    if (error instanceof FplSchemaError) {
      return errorResponse("UPSTREAM_SCHEMA_ERROR", "FPL bootstrap data does not match the required schema.", 502);
    }
    if (error instanceof FplHttpError) {
      if (error.source === "fixtures") {
        return errorResponse("FIXTURE_DATA_UNAVAILABLE", "FPL fixture data is currently unavailable.", 502, error.status);
      }
      const status = error.status === 429 ? 429 : 502;
      return errorResponse(error.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR", "FPL upstream data is currently unavailable.", status, error.status);
    }
    return errorResponse("INTERNAL_ERROR", "Unexpected failure while building recommendation payload.", 500);
  }
}
