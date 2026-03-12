"use client";

import { useMemo, useState } from "react";
import type { PlayerView } from "@/lib/recommendation/types";
import { PlayerTile } from "@/components/player-tile";

export type ListSortBy = "position" | "points" | "name" | "club";

export interface RecommendedListViewProps {
  startingXI: PlayerView[];
  bench: PlayerView[];
  captainId: number;
  viceId: number;
  teamShortNames: Record<number, string>;
  selectedPlayerId: number | null;
  onSelect: (player: PlayerView) => void;
}

const POSITION_ORDER: Record<PlayerView["position"], number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
};

function sortPlayers(
  players: PlayerView[],
  sortBy: ListSortBy,
  teamShortNames: Record<number, string>
): PlayerView[] {
  const arr = [...players];
  switch (sortBy) {
    case "position":
      arr.sort((a, b) => {
        const pa = POSITION_ORDER[a.position];
        const pb = POSITION_ORDER[b.position];
        if (pa !== pb) return pa - pb;
        return b.projectedPoints - a.projectedPoints;
      });
      break;
    case "points":
      arr.sort((a, b) => b.projectedPoints - a.projectedPoints);
      break;
    case "name":
      arr.sort((a, b) => a.webName.localeCompare(b.webName, undefined, { sensitivity: "base" }));
      break;
    case "club":
      arr.sort((a, b) => {
        const clubA = teamShortNames[a.teamId] ?? "";
        const clubB = teamShortNames[b.teamId] ?? "";
        return clubA.localeCompare(clubB, undefined, { sensitivity: "base" });
      });
      break;
  }
  return arr;
}

const SORT_OPTIONS: { value: ListSortBy; label: string }[] = [
  { value: "position", label: "Position" },
  { value: "points", label: "Points" },
  { value: "name", label: "Name" },
  { value: "club", label: "Club" },
];

export function RecommendedListView({
  startingXI,
  bench,
  captainId,
  viceId,
  teamShortNames,
  selectedPlayerId,
  onSelect,
}: RecommendedListViewProps) {
  const [sortBy, setSortBy] = useState<ListSortBy>("position");

  const sortedStartingXI = useMemo(
    () => sortPlayers(startingXI, sortBy, teamShortNames),
    [startingXI, sortBy, teamShortNames]
  );
  const sortedBench = useMemo(
    () => sortPlayers(bench, sortBy, teamShortNames),
    [bench, sortBy, teamShortNames]
  );

  return (
    <section className="rounded-2xl border border-border/50 overflow-hidden bg-panel/40">
      <div className="border-b border-border/40 bg-panel/60 px-3 py-2 min-[480px]:px-4 min-[480px]:py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted leading-snug">Starting XI</h2>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ListSortBy)}
              className="rounded-md border border-border/60 bg-panel/80 px-2 py-1 text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-brand/50"
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-2 min-[480px]:gap-2.5 min-[480px]:p-3">
        {sortedStartingXI.map((player) => (
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
        {sortedBench.map((player, index) => (
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
