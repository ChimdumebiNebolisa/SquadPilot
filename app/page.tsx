"use client";

import { useState } from "react";
import { BenchDock } from "@/components/bench-dock";
import { PerspectivePitch } from "@/components/perspective-pitch";
import { PlayerDetailSheet } from "@/components/player-detail-sheet";
import { PitchSkeleton } from "@/components/pitch-skeleton";
import { RecommendedListView } from "@/components/recommended-list-view";
import { SquadSummaryStrip } from "@/components/squad-summary-strip";
import { SquadTopBar } from "@/components/squad-top-bar";
import { SquadViewToggle, type SquadViewMode } from "@/components/squad-view-toggle";
import type { PlayerView, RecommendErrorResponse, RecommendResponse } from "@/lib/recommendation/types";

type UiState = "idle" | "loading" | "success" | "error";

function normalizeError(code: string, fallbackMessage: string): string {
  if (code === "UPSTREAM_ERROR") {
    return "FPL upstream service is unavailable. Please retry shortly.";
  }
  if (code === "RATE_LIMITED") {
    return "Too many requests right now. Please retry in a moment.";
  }
  return fallbackMessage;
}

export default function Home() {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<RecommendResponse | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerView | null>(null);
  /** Default to list view on page load (not pitch). */
  const [viewMode, setViewMode] = useState<SquadViewMode>("list");

  const recommendation = response?.data.recommendation;
  const teamShortNames = Object.fromEntries((response?.data.teams ?? []).map((t) => [t.id, t.shortName]));

  async function generateRecommendation() {
    setUiState("loading");
    setErrorMessage(null);
    setSelectedPlayer(null);

    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const body = (await res.json()) as RecommendResponse | RecommendErrorResponse;

    if (!res.ok || !body.ok) {
      const error = (body as RecommendErrorResponse).error;
      setErrorMessage(normalizeError(error.code, error.message));
      setUiState("error");
      setResponse(null);
      return;
    }

    const parsed = body as RecommendResponse;
    setResponse(parsed);
    setSelectedPlayer(parsed.data.recommendation.captain);
    setUiState("success");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-3 min-[480px]:gap-4 min-[480px]:px-4 min-[480px]:py-4 md:px-6 md:py-6">
        <SquadTopBar
          hasResults={uiState === "success"}
          nextGw={response?.data.nextGw}
          isGenerating={uiState === "loading"}
          onGenerate={generateRecommendation}
        />

        {uiState === "loading" && <PitchSkeleton />}

        {uiState === "error" && errorMessage && (
          <section className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100 leading-snug min-[480px]:p-5">
            {errorMessage}
          </section>
        )}

        {uiState === "idle" && (
          <section className="premium-panel rounded-card border border-dashed border-border p-4 min-[480px]:p-5">
            <h2 className="text-base font-semibold min-[480px]:text-lg">Ready to Generate</h2>
            <p className="mt-1.5 text-sm text-muted leading-snug">
              Generate next-GW recommendation to view pitch, bench, and rationale.
            </p>
          </section>
        )}

        {uiState === "success" && recommendation && (
          <>
            <SquadSummaryStrip recommendation={recommendation} />
            <SquadViewToggle value={viewMode} onChange={setViewMode} />

            {/* Pitch section commented out – list view only */}
            {/* viewMode === "pitch" ? ( <div><PerspectivePitch ... /><BenchDock ... /></div> ) : ( */}
            <RecommendedListView
              startingXI={recommendation.startingXI}
              bench={recommendation.bench}
              captainId={recommendation.captain.id}
              viceId={recommendation.viceCaptain.id}
              teamShortNames={teamShortNames}
              selectedPlayerId={selectedPlayer?.id ?? null}
              onSelect={setSelectedPlayer}
            />
            {/* )} */}

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
