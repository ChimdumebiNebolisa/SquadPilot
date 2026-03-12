"use client";

import type { PlayerView } from "@/lib/recommendation/types";
import { PlayerTile } from "@/components/player-tile";

export interface RecommendedListViewProps {
  startingXI: PlayerView[];
  bench: PlayerView[];
  captainId: number;
  viceId: number;
  teamShortNames: Record<number, string>;
  selectedPlayerId: number | null;
  onSelect: (player: PlayerView) => void;
}

export function RecommendedListView({
  startingXI,
  bench,
  captainId,
  viceId,
  teamShortNames,
  selectedPlayerId,
  onSelect,
}: RecommendedListViewProps) {
  return (
    <section className="rounded-2xl border border-border/50 overflow-hidden bg-panel/40">
      <div className="border-b border-border/40 bg-panel/60 px-3 py-2 min-[480px]:px-4 min-[480px]:py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted leading-snug">Starting XI</h2>
      </div>
      <div className="divide-y divide-border/30">
        {startingXI.map((player) => (
          <PlayerTile
            key={player.id}
            player={player}
            captainId={captainId}
            viceId={viceId}
            teamShortNames={teamShortNames}
            selectedPlayerId={selectedPlayerId}
            onSelect={onSelect}
            variant="list"
          />
        ))}
      </div>

      <div className="border-t border-border/50 bg-panel/30 px-3 py-2 min-[480px]:px-4 min-[480px]:py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted leading-snug">Bench</h2>
      </div>
      <div className="grid gap-2 border-t border-border/30 p-2 min-[480px]:grid-cols-2 min-[480px]:gap-2.5 min-[480px]:p-3">
        {bench.map((player, index) => (
          <PlayerTile
            key={player.id}
            player={player}
            captainId={captainId}
            viceId={viceId}
            teamShortNames={teamShortNames}
            selectedPlayerId={selectedPlayerId}
            onSelect={onSelect}
            variant="list"
            slotLabel={`B${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
