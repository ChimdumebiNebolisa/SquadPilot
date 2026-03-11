"use client";

import { useState } from "react";
import { BenchRow } from "@/components/bench-row";
import { PitchView } from "@/components/pitch-view";
import { PlayerCards } from "@/components/player-cards";
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

  const recommendation = response?.data.recommendation;
  const teamShortNames = Object.fromEntries((response?.data.teams ?? []).map((team) => [team.id, team.shortName]));

  async function generateRecommendation() {
    setUiState("loading");
    setErrorMessage(null);
    setSelectedPlayer(null);

    const httpResponse = await fetch("/api/recommend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const body = (await httpResponse.json()) as RecommendResponse | RecommendErrorResponse;

    if (!httpResponse.ok || !body.ok) {
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
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
        <header className="rounded-card border border-border bg-panel px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">FPL SquadPilot</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">Next Gameweek Squad Generator</h1>
              <p className="mt-2 text-sm text-muted">One click for a projected 15-man squad, XI, captain, and vice.</p>
            </div>
            <button
              type="button"
              onClick={generateRecommendation}
              disabled={uiState === "loading"}
              className="h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {uiState === "loading" ? "Generating..." : "Generate Squad"}
            </button>
          </div>
        </header>

        {uiState === "loading" && (
          <section className="grid gap-3 lg:grid-cols-5">
            <article className="h-24 animate-pulse rounded-card border border-border bg-panel" />
            <article className="h-24 animate-pulse rounded-card border border-border bg-panel" />
            <article className="h-24 animate-pulse rounded-card border border-border bg-panel" />
            <article className="h-24 animate-pulse rounded-card border border-border bg-panel" />
            <article className="h-24 animate-pulse rounded-card border border-border bg-panel" />
          </section>
        )}

        {uiState === "error" && errorMessage && (
          <section className="rounded-card border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            {errorMessage}
          </section>
        )}

        {uiState === "idle" && (
          <section className="rounded-card border border-dashed border-border bg-panel p-5">
            <h2 className="text-lg font-semibold">Ready to Generate</h2>
            <p className="mt-1 text-sm text-muted">Generate the next-gameweek recommendation to view the full pitch, bench, and player rationale.</p>
          </section>
        )}

        {uiState === "success" && recommendation && (
          <>
            <section className="rounded-card border border-border bg-panel px-3 py-2 md:px-4 md:py-3">
              <div className="grid gap-2 md:grid-cols-5">
                <article className="rounded-lg border border-border/80 bg-panel-elevated px-3 py-2.5 md:border-none md:bg-transparent md:px-2 md:py-1.5">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted">GW</p>
                  <p className="mt-1 text-lg font-semibold text-white">{response?.data.nextGw}</p>
                </article>
                <article className="rounded-lg border border-border/80 bg-panel-elevated px-3 py-2.5 md:border-none md:bg-transparent md:px-2 md:py-1.5 md:border-l md:border-border/70">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Budget</p>
                  <p className="mt-1 text-lg font-semibold text-white">£{recommendation.budgetUsed.toFixed(1)}m</p>
                </article>
                <article className="rounded-lg border border-border/80 bg-panel-elevated px-3 py-2.5 md:border-none md:bg-transparent md:px-2 md:py-1.5 md:border-l md:border-border/70">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Captain</p>
                  <p className="mt-1 text-lg font-semibold text-white">{recommendation.captain.webName}</p>
                </article>
                <article className="rounded-lg border border-border/80 bg-panel-elevated px-3 py-2.5 md:border-none md:bg-transparent md:px-2 md:py-1.5 md:border-l md:border-border/70">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Vice</p>
                  <p className="mt-1 text-lg font-semibold text-white">{recommendation.viceCaptain.webName}</p>
                </article>
                <article className="rounded-lg border border-border/80 bg-panel-elevated px-3 py-2.5 md:border-none md:bg-transparent md:px-2 md:py-1.5 md:border-l md:border-border/70">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Solver</p>
                  <p className="mt-1 text-lg font-semibold capitalize text-white">{recommendation.solver.mode}</p>
                </article>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
              <div className="space-y-3">
                <PitchView
                  startingXI={recommendation.startingXI}
                  captainId={recommendation.captain.id}
                  viceId={recommendation.viceCaptain.id}
                  teamShortNames={teamShortNames}
                  selectedPlayerId={selectedPlayer?.id ?? null}
                  onSelect={setSelectedPlayer}
                />
                <BenchRow
                  bench={recommendation.bench}
                  teamShortNames={teamShortNames}
                  selectedPlayerId={selectedPlayer?.id ?? null}
                  onSelect={setSelectedPlayer}
                />
              </div>
              <aside className="rounded-card border border-border bg-panel-elevated p-4">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <h3 className="text-base font-semibold tracking-tight text-white">Player Insight</h3>
                  {selectedPlayer && (
                    <span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted">{selectedPlayer.position}</span>
                  )}
                </div>
                {selectedPlayer ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-border bg-panel px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold tracking-tight text-white">{selectedPlayer.webName}</p>
                        <p className="text-sm font-semibold text-brand">{selectedPlayer.projectedPoints.toFixed(1)} pts</p>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted">
                        {teamShortNames[selectedPlayer.teamId] ?? `T${selectedPlayer.teamId}`} · {selectedPlayer.position}
                      </p>
                    </div>

                    <div className="space-y-2.5 text-sm leading-relaxed text-foreground">
                      <p>{selectedPlayer.explanation.summary}</p>
                      <p className="text-muted">{selectedPlayer.explanation.whyPicked}</p>
                      <p className="text-muted">{selectedPlayer.explanation.mainRisk}</p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {selectedPlayer.explanation.tags.map((tag) => (
                        <span key={tag} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <p className="text-sm font-medium text-brand">Confidence: {selectedPlayer.explanation.confidence}</p>
                    <p className="text-xs text-muted">Select another player card below to switch context.</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">Pick a player card to view match-context reasoning and risk.</p>
                )}
              </aside>
            </section>

            <section>
              <PlayerCards
                players={recommendation.squad}
                captainId={recommendation.captain.id}
                viceId={recommendation.viceCaptain.id}
                selectedPlayerId={selectedPlayer?.id ?? null}
                teamShortNames={teamShortNames}
                onSelect={setSelectedPlayer}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
