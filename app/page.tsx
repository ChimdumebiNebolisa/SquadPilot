"use client";

import { useMemo, useState } from "react";
import { BenchRow } from "@/components/bench-row";
import { PitchView } from "@/components/pitch-view";
import { PlayerCards } from "@/components/player-cards";
import type { PlayerView, RecommendErrorResponse, RecommendResponse } from "@/lib/recommendation/types";

type UiState = "idle" | "loading" | "success" | "error";

function normalizeError(code: string, fallbackMessage: string): string {
  if (code === "INVALID_TEAM_ID_FORMAT" || code === "INVALID_TEAM_ID") {
    return "Team ID is invalid or unavailable for the selected gameweek.";
  }

  if (code === "UPSTREAM_ERROR") {
    return "FPL upstream service is unavailable. Please retry shortly.";
  }

  if (code === "RATE_LIMITED") {
    return "Too many requests right now. Please retry in a moment.";
  }

  return fallbackMessage;
}

export default function Home() {
  const [teamId, setTeamId] = useState("");
  const [uiState, setUiState] = useState<UiState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<RecommendResponse | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerView | null>(null);

  const recommendation = response?.data.recommendation;
  const teamImport = response?.data.teamImport;

  const recommendedIds = useMemo(() => new Set(recommendation?.squad.map((player) => player.id) ?? []), [recommendation?.squad]);

  const importedNotRecommended = useMemo(() => {
    if (!teamImport || teamImport.status !== "success") {
      return [] as PlayerView[];
    }

    return teamImport.importedPlayers.filter((player) => !recommendedIds.has(player.id));
  }, [recommendedIds, teamImport]);

  async function generateRecommendation() {
    setUiState("loading");
    setErrorMessage(null);
    setSelectedPlayer(null);

    const payload = teamId.trim().length > 0 ? { teamId: teamId.trim() } : {};

    const httpResponse = await fetch("/api/recommend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await httpResponse.json()) as RecommendResponse | RecommendErrorResponse;

    if (!httpResponse.ok || !body.ok) {
      const error = (body as RecommendErrorResponse).error;
      setErrorMessage(normalizeError(error.code, error.message));
      setUiState("error");
      setResponse(null);
      return;
    }

    setResponse(body as RecommendResponse);
    setUiState("success");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="rounded-card border border-border bg-panel p-6">
          <p className="text-sm text-muted">FPL SquadPilot</p>
          <h1 className="mt-2 text-3xl font-semibold">Next Gameweek Recommender</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Generate one projected squad recommendation with a clear, explainable output for the next gameweek.
          </p>
        </header>

        <section className="rounded-card border border-border bg-panel p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <label htmlFor="teamId" className="text-sm font-medium">
                FPL Team ID (optional)
              </label>
              <input
                id="teamId"
                name="teamId"
                inputMode="numeric"
                placeholder="e.g. 1234567"
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-brand/30 transition focus:ring-2"
              />
            </div>
            <button
              type="button"
              onClick={generateRecommendation}
              disabled={uiState === "loading"}
              className="h-11 rounded-xl bg-brand px-5 text-sm font-medium text-brand-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {uiState === "loading" ? "Generating..." : "Generate Squad"}
            </button>
          </div>
        </section>

        {uiState === "loading" && (
          <section className="grid gap-4 lg:grid-cols-3">
            <article className="h-52 animate-pulse rounded-card border border-border bg-panel lg:col-span-2" />
            <article className="h-52 animate-pulse rounded-card border border-border bg-panel" />
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
            <p className="mt-2 text-sm text-muted">Enter an optional Team ID and generate one recommended squad for next gameweek.</p>
          </section>
        )}

        {uiState === "success" && recommendation && (
          <>
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <PitchView
                  startingXI={recommendation.startingXI}
                  captainId={recommendation.captain.id}
                  viceId={recommendation.viceCaptain.id}
                />
                <BenchRow bench={recommendation.bench} />
              </div>
              <article className="rounded-card border border-border bg-panel p-5">
                <h2 className="text-lg font-semibold">Summary</h2>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  <li>GW: {response?.data.nextGw}</li>
                  <li>Budget used: £{recommendation.budgetUsed.toFixed(1)}m</li>
                  <li>Captain: {recommendation.captain.webName}</li>
                  <li>Vice: {recommendation.viceCaptain.webName}</li>
                  <li>Solver: {recommendation.solver.mode}</li>
                </ul>
              </article>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <PlayerCards players={recommendation.squad} onSelect={setSelectedPlayer} />
              </div>
              <aside className="rounded-card border border-border bg-panel p-4">
                <h3 className="text-sm font-semibold">Explanation</h3>
                {selectedPlayer ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm font-medium">{selectedPlayer.webName}</p>
                    <p className="text-sm text-muted">{selectedPlayer.explanation}</p>
                    <div className="space-y-1 text-xs text-muted">
                      {selectedPlayer.contributions
                        .slice()
                        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
                        .slice(0, 4)
                        .map((item) => (
                          <p key={item.factor}>
                            {item.factor}: {(item.contribution * 10).toFixed(2)}
                          </p>
                        ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">Select a player card to view factor-based reasoning.</p>
                )}
              </aside>
            </section>

            {teamImport?.status === "success" && (
              <section className="rounded-card border border-border bg-panel p-4">
                <h3 className="text-sm font-semibold">Imported Team Comparison</h3>
                <p className="mt-2 text-sm text-muted">
                  Team ID {teamImport.teamId} imported from GW {teamImport.sourceGameweek}. Non-overlapping imported picks: {importedNotRecommended.length}
                </p>
                {importedNotRecommended.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                    {importedNotRecommended.slice(0, 10).map((player) => (
                      <span key={player.id} className="rounded-full border border-border px-2 py-1">
                        {player.webName}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
