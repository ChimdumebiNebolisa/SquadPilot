"use client";

import type { PlayerView } from "@/lib/recommendation/types";
import { PlayerTile } from "@/components/player-tile";

export interface BenchDockProps {
  bench: PlayerView[];
  teamShortNames: Record<number, string>;
  selectedPlayerId: number | null;
  onSelect: (player: PlayerView) => void;
}

export function BenchDock({ bench, teamShortNames, selectedPlayerId, onSelect }: BenchDockProps) {
  const benchTotal = bench.length
    ? (bench.reduce((sum, p) => sum + p.projectedPoints, 0) / bench.length).toFixed(1)
    : "—";

  return (
    <div className="rounded-b-2xl border border-t-0 border-border/50 bg-panel/80 px-3 py-2 sm:px-4 sm:py-3 md:px-5">
      <div className="mb-1.5 flex items-center justify-between sm:mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Bench</span>
        <span className="text-[10px] text-muted">Avg {benchTotal} pts</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {bench.map((player, index) => (
          <PlayerTile
            key={player.id}
            player={player}
            captainId={-1}
            viceId={-1}
            teamShortNames={teamShortNames}
            selectedPlayerId={selectedPlayerId}
            onSelect={onSelect}
            variant="bench"
            slotLabel={`B${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
