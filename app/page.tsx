"use client";

import { useMemo, useState } from "react";
import { PlayerDetailSheet } from "@/components/player-detail-sheet";
import { SquadLoadingSkeleton } from "@/components/squad-loading-skeleton";
import { RecommendedListView } from "@/components/recommended-list-view";
import { SquadSummaryStrip } from "@/components/squad-summary-strip";
import { SquadTopBar } from "@/components/squad-top-bar";
import type { PlayerView, RecommendErrorResponse, RecommendResponse } from "@/lib/recommendation/types";

type UiState = "idle" | "loading" | "success" | "error";

function normalizeError(code: string, fallbackMessage: string): string {
  const messages: Record<string, string> = {
    UPSTREAM_ERROR: "FPL player data is unavailable. Please retry shortly.",
    FIXTURE_DATA_UNAVAILABLE: "FPL fixture data is unavailable, so projections cannot be calculated safely.",
    UPSTREAM_SCHEMA_ERROR: "FPL returned an unexpected data format. Please retry later.",
    RATE_LIMITED: "Too many requests right now. Please retry in a moment.",
    TEAM_UNAVAILABLE: "That Team ID could not be loaded from FPL. Check the number and retry.",
    NO_FEASIBLE_SQUAD: "No legal squad fits the current FPL data and £100m budget.",
    SEASON_COMPLETE: "The FPL season is complete; there is no next gameweek to project.",
    VALIDATION_ERROR: "The request was invalid. Check the Team ID and retry.",
  };
  return messages[code] ?? fallbackMessage;
}

export default function Home() {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<RecommendResponse | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerView | null>(null);
  const [teamId, setTeamId] = useState("");

  const recommendation = response?.data.recommendation;
  const teamShortNames = useMemo(
    () => Object.fromEntries((response?.data.teams ?? []).map((team) => [team.id, team.shortName])),
    [response],
  );
  const playersById = useMemo(
    () => new Map((recommendation?.squad ?? []).map((player) => [player.id, player])),
    [recommendation],
  );
  const startingXI = (recommendation?.startingXIIds ?? [])
    .map((id) => playersById.get(id))
    .filter((player): player is PlayerView => player != null);
  const bench = (recommendation?.benchIds ?? [])
    .map((id) => playersById.get(id))
    .filter((player): player is PlayerView => player != null);

  async function generateRecommendation() {
    setUiState("loading");
    setErrorMessage(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamId ? { teamId: Number(teamId) } : {}),
        signal: controller.signal,
      });
      const body = await res.json() as RecommendResponse | RecommendErrorResponse;
      if (!res.ok || !body.ok) {
        const error = (body as RecommendErrorResponse).error;
        throw new Error(normalizeError(error.code, error.message));
      }
      const parsed = body as RecommendResponse;
      setResponse(parsed);
      setSelectedPlayer(null);
      setUiState("success");
    } catch (error) {
      setErrorMessage(error instanceof DOMException && error.name === "AbortError"
        ? "The request took too long. Your previous squad is still available; please retry."
        : error instanceof Error ? error.message : "The recommendation could not be generated.");
      setUiState("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const hasResults = response != null && recommendation != null;
  const isGenerating = uiState === "loading";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-3 min-[480px]:gap-4 min-[480px]:px-4 min-[480px]:py-4 md:px-6 md:py-6">
        <SquadTopBar
          hasResults={hasResults}
          nextGw={response?.data.nextGw}
          isGenerating={isGenerating}
          onGenerate={generateRecommendation}
          teamId={teamId}
          onTeamIdChange={setTeamId}
        />

        {isGenerating && !hasResults && <SquadLoadingSkeleton />}

        {errorMessage && (
          <section role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm leading-snug text-rose-100 min-[480px]:p-5">
            <span>{errorMessage}</span>
            <button type="button" onClick={generateRecommendation} className="shrink-0 rounded-lg border border-rose-200/40 px-3 py-1.5 font-medium hover:bg-rose-100/10">
              Retry
            </button>
          </section>
        )}

        {uiState === "idle" && (
          <section className="premium-panel rounded-card border border-dashed border-border p-4 min-[480px]:p-5">
            <h2 className="text-base font-semibold min-[480px]:text-lg">Ready to generate</h2>
            <p className="mt-1.5 text-sm leading-snug text-muted">
              Generate a next-gameweek squad, starting XI, captain, and ordered bench.
            </p>
          </section>
        )}

        {hasResults && recommendation && response && (
          <>
            <SquadSummaryStrip recommendation={recommendation} />
            <p className="px-1 text-[11px] leading-relaxed text-muted">
              Data state: {response.data.freshness.state} · bootstrap {response.data.freshness.sources.bootstrap.state} · fixtures {response.data.freshness.sources.fixtures.state} · historical {response.data.freshness.sources.history.status} · model {response.data.scoring.modelVersion}.
            </p>
            {response.data.userTeam && (
              <section className="rounded-xl border border-border/50 bg-panel/50 px-3 py-3 text-xs leading-relaxed text-muted min-[480px]:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold uppercase tracking-wider text-foreground">Your FPL team</h2>
                  <span>Team {response.data.userTeam.teamId} · picks GW {response.data.userTeam.picksEvent ?? "unavailable"} · {response.data.userTeam.dataStatus}</span>
                </div>
                {response.data.userTeam.dataWarnings.length > 0 && (
                  <p className="mt-1 text-amber-200">{response.data.userTeam.dataWarnings.join(" ")}</p>
                )}
                {response.data.userTeam.picksAvailable ? (
                  <p className="mt-1">{response.data.userTeam.comparison.added.length} recommended additions · {response.data.userTeam.comparison.dropped.length} current players outside the recommended squad. Bank: {response.data.userTeam.bank ?? "unavailable"}. Free transfers: {response.data.userTeam.freeTransfers ?? "unavailable"}.</p>
                ) : (
                  <p className="mt-1">Current squad comparison is unavailable until FPL returns deadline-passed picks.</p>
                )}
              </section>
            )}

            <RecommendedListView
              startingXI={startingXI}
              bench={bench}
              captainId={recommendation.captainId}
              viceId={recommendation.viceCaptainId}
              teamShortNames={teamShortNames}
              selectedPlayerId={selectedPlayer?.id ?? null}
              onSelect={setSelectedPlayer}
            />

            <PlayerDetailSheet
              player={selectedPlayer}
              teamShortNames={teamShortNames}
              onClose={() => setSelectedPlayer(null)}
            />
          </>
        )}
      </main>
    </div>
  );
}
