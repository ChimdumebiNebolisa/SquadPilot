"use client";

import { useEffect, useState } from "react";
import type { PlayerView } from "@/lib/recommendation/types";

export interface PlayerDetailSheetProps {
  player: PlayerView | null;
  teamShortNames: Record<number, string>;
  onClose: () => void;
}

/** Expected minutes 0–90 per fixture. Missing or invalid → —. */
function expectedMinutesDisplay(player: PlayerView): string {
  const raw = player.expectedMinutes;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return "—";
  const mins = Math.round(raw);
  return String(Math.min(90, Math.max(1, mins)));
}

/** Fixture difficulty 1 (easy) – 5 (hard) from contribution value 0–1. */
function fixtureDifficulty1To5(player: PlayerView): number {
  const c = player.contributions.find((x) => x.factor === "fixtureDifficulty");
  const v = c?.value ?? 0.5;
  return Math.min(5, Math.max(1, Math.round(1 + (1 - v) * 4)));
}

export function PlayerDetailSheet({ player, teamShortNames, onClose }: PlayerDetailSheetProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (player) {
      const id = setTimeout(() => setOpen(true), 20);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [player]);

  if (!player) return null;

  const club = teamShortNames[player.teamId] ?? `T${player.teamId}`;
  const opponent =
    player.opponentTeamId != null ? teamShortNames[player.opponentTeamId] ?? `T${player.opponentTeamId}` : null;
  const expectedMins = expectedMinutesDisplay(player);
  const fixtureDiff = fixtureDifficulty1To5(player);
  const fivePlusEstimate = Math.round(player.fivePlusPointsEstimate);

  return (
    <>
      <div
        role="presentation"
        className="bottom-sheet-backdrop"
        style={{ opacity: 1, pointerEvents: "auto" }}
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        aria-hidden
      />
      <div
        className={`bottom-sheet-panel bottom-sheet-panel-inner ${open ? "open" : ""}`}
        role="dialog"
        aria-label="Player details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-1.5 pb-0 min-[480px]:pt-2">
          <span className="h-0.5 w-8 rounded-full bg-muted/30" aria-hidden />
        </div>
        <div className="overflow-y-auto px-4 pb-5 pt-2 min-[480px]:px-5 min-[480px]:pb-6 min-[480px]:pt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight text-white min-[480px]:text-base leading-snug">{player.webName}</h3>
              <p className="mt-1 text-[11px] leading-snug uppercase tracking-wider text-muted">
                {club} · {player.position}
              </p>
              {opponent != null && (
                <p className="mt-0.5 text-[11px] leading-snug uppercase tracking-wider text-muted/90">
                  vs {opponent}
                </p>
              )}
            </div>
            <span className="shrink-0 flex items-center gap-1 text-lg font-bold tabular-nums leading-none text-brand min-[480px]:text-xl">
              {player.projectedPoints.toFixed(1)} pts
              <svg className="h-4 w-4 min-[480px]:h-5 min-[480px]:w-5 opacity-70" viewBox="0 0 6 10" fill="currentColor" aria-hidden><path d="M0 0l4 5-4 5V0z"/></svg>
            </span>
          </div>

          <dl className="mt-3 space-y-2 text-[11px] leading-snug min-[480px]:mt-4 min-[480px]:space-y-2.5">
            <div className="flex justify-between gap-2">
              <dt className="uppercase tracking-wider text-muted"><span className="min-[480px]:hidden">Start est.</span><span className="hidden min-[480px]:inline">Start estimate</span></dt>
              <dd className="shrink-0 font-medium tabular-nums text-foreground">
              {typeof player.chanceOfStarting === "number" && !Number.isNaN(player.chanceOfStarting)
                ? `${Math.round(player.chanceOfStarting)}%`
                : "—"}
            </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="uppercase tracking-wider text-muted"><span className="min-[480px]:hidden">Exp. mins</span><span className="hidden min-[480px]:inline">Expected minutes</span></dt>
              <dd className="shrink-0 font-medium tabular-nums text-foreground">{expectedMins}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="uppercase tracking-wider text-muted"><span className="min-[480px]:hidden">Fixture diff.</span><span className="hidden min-[480px]:inline">Fixture difficulty</span></dt>
              <dd className="shrink-0 font-medium tabular-nums text-foreground">{fixtureDiff}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="uppercase tracking-wider text-muted"><span className="min-[480px]:hidden">5+ est.</span><span className="hidden min-[480px]:inline">5+ points estimate</span></dt>
              <dd className="shrink-0 font-medium tabular-nums text-foreground">{fivePlusEstimate}%</dd>
            </div>
          </dl>

          <p className="mt-2.5 text-[11px] leading-snug text-muted min-[480px]:mt-3">
            1 = easy, 5 = hard. Estimates are deterministic and not calibrated probabilities.
          </p>

          <div className="mt-3 space-y-1 text-[11px] leading-relaxed text-muted min-[480px]:mt-4">
            <p><span className="font-medium text-muted-foreground">Fixtures:</span> {player.upcomingFixtures.length > 0
              ? player.upcomingFixtures.map((fixture) => `${fixture.isHome ? "H" : "A"} · ${teamShortNames[fixture.opponentTeamId] ?? `T${fixture.opponentTeamId}`}`).join(" / ")
              : "provisional — fixture data incomplete"}</p>
            <p><span className="font-medium text-muted-foreground">Opponent history:</span> {player.historicalSampleSize > 0
              ? `${player.historicalSampleSize} match${player.historicalSampleSize === 1 ? "" : "es"} · ${player.opponentHistory[0]?.shrunkPointsPer90.toFixed(1) ?? "—"} pts/90 after shrinkage`
              : "insufficient historical data"}</p>
            <p><span className="font-medium text-muted-foreground">Sources:</span> {player.dataSources.join(" + ")}</p>
          </div>

          {(player.explanation.whyPicked || player.explanation.mainRisk) && (
            <div className="mt-3 space-y-1 text-[11px] leading-relaxed text-muted min-[480px]:mt-4 min-[480px]:space-y-1.5">
              {player.explanation.whyPicked && (
                <p><span className="font-medium text-muted-foreground">Why:</span> {player.explanation.whyPicked}</p>
              )}
              {player.explanation.mainRisk && (
                <p><span className="font-medium text-muted-foreground">Downside:</span> {player.explanation.mainRisk}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
