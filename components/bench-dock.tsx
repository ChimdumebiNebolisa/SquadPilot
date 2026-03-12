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
    <div className="rounded-b-2xl border border-t-0 border-border/50 bg-panel/80 px-3 py-2.5 min-[480px]:px-4 min-[480px]:py-3 md:px-5">
      <div className="mb-1.5 flex items-center justify-between min-[480px]:mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted leading-snug">Bench</span>
        <span className="flex items-center gap-0.5 text-[11px] text-muted leading-snug">
          Avg {benchTotal} pts
          <svg className="h-2.5 w-2.5 opacity-70" viewBox="0 0 6 10" fill="currentColor" aria-hidden><path d="M0 0l4 5-4 5V0z"/></svg>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4 min-[480px]:gap-2">
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
