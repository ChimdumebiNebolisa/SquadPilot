import { NextResponse } from "next/server";
import { normalizeFplElementSummary } from "@/lib/historical/normalize";
import { getHistoricalAvailability, loadHistoricalDataset } from "@/lib/historical/store";
import {
  FplHttpError,
  fetchBootstrapStatic,
  fetchElementSummary,
  fetchEntry,
  fetchEntryHistory,
  fetchEntryPicks,
  fetchFixtures,
  getFplSyncStatus,
} from "@/lib/fpl/fetchers";
import { normalizeBootstrap, normalizeFixtures, resolveGameweeksPlayed, resolveNextGameweek } from "@/lib/fpl/normalize";
import { normalizeCurrentUserTeam } from "@/lib/fpl/team";
import type { OpponentHistoryView } from "@/lib/fpl/types";
import { scorePlayers } from "@/lib/scoring/score";
import { SCORING_WEIGHTS_VERSION } from "@/lib/scoring/weights";
import type { ProjectedPlayer } from "@/lib/scoring/types";
import { buildRecommendation, chooseBestStartingXI } from "@/lib/solver/recommend";
import { checkRateLimit } from "@/lib/server/rate-limit";

function parseTeamId(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { teamId?: unknown }).teamId;
  const teamId = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(teamId) && teamId > 0 ? teamId : null;
}

async function loadCurrentTeam(teamId: number, nextGw: number) {
  const entryRaw = await fetchEntry(teamId);
  const [historyResult, picksResult] = await Promise.allSettled([
    fetchEntryHistory(teamId),
    fetchEntryPicks(teamId, nextGw),
  ]);
  const historyRaw = historyResult.status === "fulfilled" ? historyResult.value : null;
  const picksRaw = picksResult.status === "fulfilled" ? picksResult.value : null;
  const team = normalizeCurrentUserTeam(teamId, entryRaw, historyRaw, picksRaw);
  return { team, picksError: picksResult.status === "rejected", historyError: historyResult.status === "rejected" };
}

async function loadCurrentSeasonHistory(playerIds: number[]): Promise<Map<number, OpponentHistoryView[]>> {
  const result = new Map<number, OpponentHistoryView[]>();
  const summaries = await Promise.allSettled(playerIds.map((playerId) => fetchElementSummary(playerId)));
  summaries.forEach((summary, index) => {
    if (summary.status !== "fulfilled") return;
    const playerId = playerIds[index];
    if (!playerId) return;
    const normalized = normalizeFplElementSummary(playerId, summary.value);
    result.set(playerId, normalized.opponentAggregates.map((record) => ({ ...record, baselinePointsPer90: null })));
  });
  return result;
}

function buildUserTeamView(
  currentTeam: Awaited<ReturnType<typeof loadCurrentTeam>>["team"],
  projectedPlayers: ProjectedPlayer[],
  recommendation: NonNullable<ReturnType<typeof buildRecommendation>>,
) {
  const byId = new Map(projectedPlayers.map((player) => [player.id, player]));
  const currentPlayers = currentTeam.squad
    .map((pick) => byId.get(pick.playerId))
    .filter((player): player is ProjectedPlayer => player != null);
  const currentXI = chooseBestStartingXI(currentPlayers) ?? [];
  const recommendedCaptain = [...currentXI].sort((a, b) => b.projectedPoints - a.projectedPoints)[0] ?? null;
  const recommendedVice = [...currentXI]
    .filter((player) => player.id !== recommendedCaptain?.id)
    .sort((a, b) => b.projectedPoints - a.projectedPoints)[0] ?? null;
  const currentIds = new Set(currentPlayers.map((player) => player.id));
  const recommendedIds = new Set(recommendation.squad.map((player) => player.id));
  const captainPick = currentTeam.squad.find((pick) => pick.isCaptain)?.playerId ?? null;
  const vicePick = currentTeam.squad.find((pick) => pick.isViceCaptain)?.playerId ?? null;

  return {
    teamId: currentTeam.teamId,
    teamName: currentTeam.teamName,
    currentPlayers: currentPlayers.map((player) => ({
      playerId: player.id,
      webName: player.webName,
      currentPoints: player.totalPoints,
      projectedPoints: player.projectedPoints,
      chanceOfStarting: player.chanceOfStarting,
    })),
    bank: currentTeam.bank,
    freeTransfers: currentTeam.freeTransfers,
    captainId: captainPick,
    viceCaptainId: vicePick,
    recommendedStartingXIIds: currentXI.map((player) => player.id),
    recommendedCaptainId: recommendedCaptain?.id ?? null,
    recommendedViceCaptainId: recommendedVice?.id ?? null,
    weakPlayers: currentPlayers
      .filter((player) => player.chanceOfStarting < 50 || player.fixtureCount === 0)
      .sort((a, b) => a.chanceOfStarting - b.chanceOfStarting)
      .slice(0, 5)
      .map((player) => ({
        playerId: player.id,
        webName: player.webName,
        reason: player.fixtureCount === 0 ? "fixture data incomplete" : `start estimate ${player.chanceOfStarting}%`,
      })),
    comparison: {
      added: [...recommendedIds].filter((id) => !currentIds.has(id)),
      dropped: [...currentIds].filter((id) => !recommendedIds.has(id)),
    },
  };
}

export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const clientKey = forwardedFor?.split(",")[0]?.trim() || "local";
    const rateLimit = checkRateLimit(clientKey);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please retry shortly." } },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const requestedTeamId = parseTeamId(body);
    const bootstrapRaw = await fetchBootstrapStatic();
    const nextGw = resolveNextGameweek(bootstrapRaw);
    const fixturesRaw = await fetchFixtures();
    const { players, teams } = normalizeBootstrap(bootstrapRaw);
    const fixtures = normalizeFixtures(fixturesRaw);
    const gameweeksPlayed = resolveGameweeksPlayed(bootstrapRaw);
    const historical = loadHistoricalDataset();

    let currentTeamResult: Awaited<ReturnType<typeof loadCurrentTeam>> | null = null;
    if (requestedTeamId != null) {
      try {
        currentTeamResult = await loadCurrentTeam(requestedTeamId, nextGw);
      } catch {
        return NextResponse.json(
          { ok: false, error: { code: "TEAM_UNAVAILABLE", message: "The supplied Team ID could not be loaded from FPL." } },
          { status: 422 },
        );
      }
    }

    const currentSeasonHistory = currentTeamResult
      ? await loadCurrentSeasonHistory(currentTeamResult.team.squad.map((pick) => pick.playerId))
      : undefined;
    const projectedPlayers = scorePlayers(players, teams, fixtures, gameweeksPlayed, {
      nextGameweek: nextGw,
      historical,
      currentSeasonOpponentHistory: currentSeasonHistory,
    });
    const recommendation = buildRecommendation(projectedPlayers);
    if (!recommendation) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_FEASIBLE_SQUAD", message: "No legal 15-player squad fits the current data and £100m budget." } },
        { status: 422 },
      );
    }

    const historicalStatus = getHistoricalAvailability();
    const freshness = getFplSyncStatus();
    const userTeam = currentTeamResult
      ? buildUserTeamView(currentTeamResult.team, projectedPlayers, recommendation)
      : undefined;

    return NextResponse.json({
      ok: true,
      data: {
        nextGw,
        recommendation,
        teams,
        freshness: { ...freshness, historicalStatus: historicalStatus.status },
        userTeam,
        scoring: { weightsVersion: SCORING_WEIGHTS_VERSION, fplExpectedPoints: "baseline comparator only" },
      },
    });
  } catch (error) {
    if (error instanceof FplHttpError) {
      return NextResponse.json(
        { ok: false, error: { code: error.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR", message: "FPL upstream data is currently unavailable.", status: error.status } },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Unexpected failure while building recommendation payload." } },
      { status: 500 },
    );
  }
}
