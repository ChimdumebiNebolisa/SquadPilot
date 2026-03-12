"use client";

import type { PlayerView } from "@/lib/recommendation/types";
import { PlayerTile } from "@/components/player-tile";

export interface PerspectivePitchProps {
  startingXI: PlayerView[];
  captainId: number;
  viceId: number;
  teamShortNames: Record<number, string>;
  selectedPlayerId: number | null;
  onSelect: (player: PlayerView) => void;
}

function groupByPosition(players: PlayerView[]) {
  return {
    GK: players.filter((p) => p.position === "GK"),
    DEF: players.filter((p) => p.position === "DEF"),
    MID: players.filter((p) => p.position === "MID"),
    FWD: players.filter((p) => p.position === "FWD"),
  };
}

/* Intentional row scale: back rows slightly smaller for depth; front row slightly larger */
const ROW_CONFIG = [
  { key: "GK", scale: "scale(0.88)", opacity: "opacity-85" },
  { key: "DEF", scale: "scale(0.94)", opacity: "opacity-92" },
  { key: "MID", scale: "scale(1)", opacity: "opacity-100" },
  { key: "FWD", scale: "scale(1.03)", opacity: "opacity-100" },
] as const;

export function PerspectivePitch({
  startingXI,
  captainId,
  viceId,
  teamShortNames,
  selectedPlayerId,
  onSelect,
}: PerspectivePitchProps) {
  const grouped = groupByPosition(startingXI);
  const lines: Array<{ key: keyof typeof grouped; players: PlayerView[]; scale: string; opacity: string }> = [
    { key: "GK", players: grouped.GK, scale: ROW_CONFIG[0].scale, opacity: ROW_CONFIG[0].opacity },
    { key: "DEF", players: grouped.DEF, scale: ROW_CONFIG[1].scale, opacity: ROW_CONFIG[1].opacity },
    { key: "MID", players: grouped.MID, scale: ROW_CONFIG[2].scale, opacity: ROW_CONFIG[2].opacity },
    { key: "FWD", players: grouped.FWD, scale: ROW_CONFIG[3].scale, opacity: ROW_CONFIG[3].opacity },
  ];

  return (
    <div className="perspective-pitch-wrapper w-full">
      <div className="perspective-pitch-surface rounded-2xl border border-border/50 p-3 min-[480px]:p-4 md:p-5">
        {/* Subtle pitch markings */}
        <div
          className="pointer-events-none absolute left-1/2 top-[20%] h-12 w-12 -translate-x-1/2 rounded-full border border-[var(--pitch-line)]"
          style={{ opacity: 0.6 }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-4 right-4 top-1/2 h-px bg-[var(--pitch-line)]"
          style={{ opacity: 0.6 }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-[18%] left-1/2 h-12 w-20 -translate-x-1/2 rounded-t-full border border-b-0 border-[var(--pitch-line)]"
          style={{ opacity: 0.5 }}
          aria-hidden
        />

        <div className="relative flex flex-col items-center gap-3 min-[480px]:gap-4 md:gap-5">
          {lines.map(({ key, players, scale, opacity }) => (
            <div
              key={key}
              className={`grid w-full justify-center gap-2 min-[480px]:gap-2 md:gap-2.5 ${opacity}`}
              style={{
                transform: scale,
                gridTemplateColumns: `repeat(${Math.max(players.length, 1)}, var(--pitch-tile-width, 82px))`,
                margin: "0 auto",
              }}
            >
              {players.map((player) => (
                <PlayerTile
                  key={player.id}
                  player={player}
                  captainId={captainId}
                  viceId={viceId}
                  teamShortNames={teamShortNames}
                  selectedPlayerId={selectedPlayerId}
                  onSelect={onSelect}
                  variant="pitch"
                />
              ))}
              {players.length === 0 && (
                <div className="flex h-[80px] min-w-0 items-center justify-center rounded-xl border border-dashed border-border/50 text-[10px] text-muted min-[480px]:h-[58px]" style={{ width: "var(--pitch-tile-width, 82px)" }}>
                  —
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
