"use client";

import type { PlayerView } from "@/lib/recommendation/types";

export interface PlayerTileProps {
  player: PlayerView;
  captainId: number;
  viceId: number;
  teamShortNames: Record<number, string>;
  selectedPlayerId: number | null;
  onSelect: (player: PlayerView) => void;
  slotLabel?: string;
}

function displayName(webName: string): string {
  const raw = webName.trim();
  const parts = raw.split(/\s+/);
  const value = parts.length > 1 ? parts.at(-1) ?? raw : raw;
  return value.length > 18 ? `${value.slice(0, 17)}·` : value;
}

export function PlayerTile({
  player,
  captainId,
  viceId,
  teamShortNames,
  selectedPlayerId,
  onSelect,
  slotLabel,
}: PlayerTileProps) {
  const isCaptain = player.id === captainId;
  const isVice = player.id === viceId;
  const isSelected = player.id === selectedPlayerId;
  const club = teamShortNames[player.teamId] ?? `T${player.teamId}`;
  const badge = isCaptain ? "C" : isVice ? "VC" : null;
  const ringClass = isSelected
    ? "ring-2 ring-brand/50 shadow-[0_0_0_1px_rgba(58,162,117,0.35),0_8px_20px_rgba(0,0,0,0.4)]"
    : isCaptain
      ? "ring-1 ring-captain/35 shadow-[0_4px_14px_rgba(0,0,0,0.3)]"
      : isVice
        ? "ring-1 ring-vice/35 shadow-[0_4px_14px_rgba(0,0,0,0.3)]"
        : "ring-1 ring-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:ring-white/15";

  return (
    <button
      type="button"
      onClick={() => onSelect(player)}
      className={`premium-panel relative flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${ringClass}${isSelected ? " player-tile-selected" : ""}`}
    >
      {slotLabel && <span className="w-6 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted">{slotLabel}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-xs font-medium leading-tight text-white/95" title={player.webName}>{displayName(player.webName)}</p>
          {badge && (
            <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${badge === "C" ? "bg-captain/20 text-captain" : "bg-vice/20 text-vice"}`}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted">{club} · {player.position}</p>
      </div>
      <span className="flex w-12 shrink-0 items-center justify-end text-base font-bold tabular-nums text-brand">
        {player.projectedPoints.toFixed(1)}
      </span>
    </button>
  );
}
