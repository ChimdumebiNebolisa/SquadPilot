"use client";

import { useEffect, useState } from "react";
import type { PlayerView } from "@/lib/recommendation/types";

export interface PlayerDetailSheetProps {
  player: PlayerView | null;
  teamShortNames: Record<number, string>;
  onClose: () => void;
}

/** Expected minutes 1–90 from model contribution (0–1). Missing or invalid → —. */
function expectedMinutesDisplay(player: PlayerView): string {
  const raw = player.contributions.find((c) => c.factor === "expectedMinutes")?.value;
  if (raw == null || typeof raw !== "number" || !Number.isFinite(raw)) return "—";
  const mins = Math.round(raw * 90);
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
    setOpen(false);
  }, [player]);

  if (!player) return null;

  const club = teamShortNames[player.teamId] ?? `T${player.teamId}`;
  const expectedMins = expectedMinutesDisplay(player);
  const fixtureDiff = fixtureDifficulty1To5(player);
  const fivePlusChance = Math.round(player.chanceOfFivePlusPoints);

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
        <div className="flex shrink-0 justify-center pt-2 pb-0">
          <span className="h-0.5 w-8 rounded-full bg-muted/30" aria-hidden />
        </div>
        <div className="overflow-y-auto px-4 pb-5 pt-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-tight text-white">{player.webName}</h3>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">
                {club} · {player.position}
              </p>
            </div>
            <span className="shrink-0 text-2xl font-bold tabular-nums leading-none text-brand">
              {player.projectedPoints.toFixed(1)} pts
            </span>
          </div>

          <dl className="mt-3 space-y-1.5 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="uppercase tracking-wider text-muted">Expected minutes</dt>
              <dd className="font-medium tabular-nums text-foreground">{expectedMins}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="uppercase tracking-wider text-muted">Fixture difficulty</dt>
              <dd className="font-medium tabular-nums text-foreground">{fixtureDiff}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="uppercase tracking-wider text-muted">5+ points chance</dt>
              <dd className="font-medium tabular-nums text-foreground">{fivePlusChance}%</dd>
            </div>
          </dl>

          <p className="mt-2.5 text-[10px] text-muted">
            Fixture difficulty: 1 easy, 5 hard.
          </p>

          {(player.explanation.whyPicked || player.explanation.mainRisk) && (
            <div className="mt-3 space-y-1 text-[11px] leading-snug text-muted">
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
