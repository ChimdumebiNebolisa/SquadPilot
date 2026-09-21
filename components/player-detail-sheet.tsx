"use client";

import { useEffect, useId, useRef } from "react";
import type { PlayerView } from "@/lib/recommendation/types";
import { startOutlookLabel } from "@/lib/scoring/start-outlook";

export interface PlayerDetailSheetProps {
  player: PlayerView | null;
  teamShortNames: Record<number, string>;
  onClose: () => void;
}

function expectedMinutesDisplay(player: PlayerView): string {
  if (!Number.isFinite(player.expectedMinutes)) return "—";
  return String(Math.min(90, Math.max(0, Math.round(player.expectedMinutes))));
}

function fixtureDifficulty1To5(player: PlayerView): number {
  const contribution = player.contributions.find((item) => item.factor === "fixtureDifficulty");
  return Math.min(5, Math.max(1, Math.round(1 + (1 - (contribution?.value ?? 0.5)) * 4)));
}

export function PlayerDetailSheet({ player, teamShortNames, onClose }: PlayerDetailSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (player && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!player && dialog.open) dialog.close();
  }, [player]);

  function restoreFocus() {
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  function dismiss() {
    onClose();
    restoreFocus();
  }

  if (!player) return <dialog ref={dialogRef} className="player-dialog" />;

  const club = teamShortNames[player.teamId] ?? `T${player.teamId}`;
  const opponent = player.opponentTeamId == null
    ? null
    : teamShortNames[player.opponentTeamId] ?? `T${player.opponentTeamId}`;

  return (
    <dialog
      ref={dialogRef}
      className="player-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={restoreFocus}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <article className="player-dialog-panel" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id={titleId} className="truncate text-base font-semibold tracking-tight text-white">{player.webName}</h3>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">
              {club} · {player.position}{opponent ? ` · vs ${opponent}` : ""}
            </p>
          </div>
          <button type="button" onClick={dismiss} className="rounded-md p-2 text-muted hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" aria-label="Close player details">
            <span aria-hidden>×</span>
          </button>
        </div>

        <p className="mt-3 text-xl font-bold tabular-nums text-brand">{player.projectedPoints.toFixed(1)} pts</p>

        <dl className="mt-4 space-y-2 text-xs">
          <div className="flex justify-between gap-3"><dt className="text-muted">Starting outlook (heuristic)</dt><dd>{startOutlookLabel(player.startEstimatePercent)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Expected minutes</dt><dd>{expectedMinutesDisplay(player)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Fixture difficulty</dt><dd>{fixtureDifficulty1To5(player)} / 5</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Chance of 5+ GW points (model estimate)</dt><dd>{Math.round(player.fivePlusProbability)}%</dd></div>
        </dl>

        <div className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
          {player.fixtureCount > 1 && <p>Double-gameweek probability has limited held-out evidence.</p>}
          <p>The 5+ estimate combines current performance with previous-season player and opponent history when available.</p>
          <p><span className="font-medium text-muted-foreground">Fixtures:</span> {player.upcomingFixtures.map((fixture) => `${fixture.isHome ? "H" : "A"} · ${teamShortNames[fixture.opponentTeamId] ?? `T${fixture.opponentTeamId}`}`).join(" / ")}</p>
          <p><span className="font-medium text-muted-foreground">Opponent history:</span> {player.historicalSampleSize > 0 ? `${player.historicalSampleSize} match${player.historicalSampleSize === 1 ? "" : "es"}` : "insufficient data"}</p>
          <p><span className="font-medium text-muted-foreground">Sources:</span> {player.dataSources.join(" + ")}</p>
        </div>

        <div className="mt-4 space-y-1.5 text-xs leading-relaxed text-muted">
          <p><span className="font-medium text-muted-foreground">Why:</span> {player.explanation.whyPicked}</p>
          <p><span className="font-medium text-muted-foreground">Downside:</span> {player.explanation.mainRisk}</p>
        </div>
      </article>
    </dialog>
  );
}
