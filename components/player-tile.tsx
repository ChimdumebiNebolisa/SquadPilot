"use client";

import type { PlayerView } from "@/lib/recommendation/types";

export interface PlayerTileProps {
  player: PlayerView;
  captainId: number;
  viceId: number;
  teamShortNames: Record<number, string>;
  selectedPlayerId: number | null;
  onSelect: (player: PlayerView) => void;
  /** "pitch" = full tile, "bench" = compact for dock, "list" = list row */
  variant?: "pitch" | "bench" | "list";
  /** Optional slot label e.g. "B1" for bench */
  slotLabel?: string;
}

function formatDisplayName(webName: string, variant: "pitch" | "bench" | "list"): { text: string; className: string } {
  const raw = webName.trim();
  const parts = raw.split(/\s+/);
  const maxLen = variant === "pitch" ? 9 : variant === "list" ? 18 : 11;
  const nameClass = variant === "pitch" ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-[11px]";
  if (parts.length <= 1) {
    const text = raw.length > maxLen ? raw.slice(0, maxLen - 1) + "·" : raw;
    return { text, className: nameClass };
  }
  const last = parts[parts.length - 1] ?? raw;
  const short = last.length > maxLen ? last.slice(0, maxLen - 1) + "·" : last;
  return { text: short, className: nameClass };
}

function roleBadge(playerId: number, captainId: number, viceId: number): "C" | "VC" | null {
  if (playerId === captainId) return "C";
  if (playerId === viceId) return "VC";
  return null;
}

export function PlayerTile({
  player,
  captainId,
  viceId,
  teamShortNames,
  selectedPlayerId,
  onSelect,
  variant = "pitch",
  slotLabel,
}: PlayerTileProps) {
  const isCaptain = player.id === captainId;
  const isVice = player.id === viceId;
  const isSelected = player.id === selectedPlayerId;
  const club = teamShortNames[player.teamId] ?? `T${player.teamId}`;
  const badge = roleBadge(player.id, captainId, viceId);
  const { text: displayName, className: nameSizeClass } = formatDisplayName(player.webName, variant);

  const ringClass = isSelected
    ? "ring-2 ring-brand/50 shadow-[0_0_0_1px_rgba(58,162,117,0.35),0_8px_20px_rgba(0,0,0,0.4)]"
    : isCaptain
      ? "ring-1 ring-captain/35 shadow-[0_4px_14px_rgba(0,0,0,0.3)]"
      : isVice
        ? "ring-1 ring-vice/35 shadow-[0_4px_14px_rgba(0,0,0,0.3)]"
        : "ring-1 ring-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:ring-white/15 hover:shadow-[0_6px_16px_rgba(0,0,0,0.3)]";

  const base =
    "relative w-full rounded-lg text-left transition-all duration-200 ease-out focus-visible:outline-none premium-panel " +
    ringClass +
    (isSelected ? " player-tile-selected" : "");

  if (variant === "bench") {
    return (
      <button
        type="button"
        onClick={() => onSelect(player)}
        className={`${base} flex items-center gap-1.5 px-1.5 py-1 min-h-[36px] sm:gap-2 sm:px-2 sm:py-1.5 sm:min-h-[40px]`}
      >
        {slotLabel && (
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted">{slotLabel}</span>
        )}
        <div className="min-w-0 flex-1 text-left">
          <p className={`truncate font-medium leading-tight text-white/95 ${nameSizeClass}`} title={player.webName}>
            {displayName}
          </p>
          <p className="text-[9px] uppercase tracking-wider text-muted">{club}</p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-brand">{player.projectedPoints.toFixed(1)}</span>
      </button>
    );
  }

  if (variant === "list") {
    return (
      <button
        type="button"
        onClick={() => onSelect(player)}
        className={`${base} flex items-center gap-2 px-2.5 py-1.5 min-h-[40px] sm:gap-2.5 sm:px-3 sm:py-2 sm:min-h-[44px]`}
      >
        {slotLabel && (
          <span className="shrink-0 w-6 text-[9px] font-semibold uppercase tracking-wider text-muted">{slotLabel}</span>
        )}
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <p className={`truncate font-medium leading-tight text-white/95 ${nameSizeClass}`} title={player.webName}>
              {displayName}
            </p>
            {badge && (
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                  badge === "C" ? "bg-captain/20 text-captain" : "bg-vice/20 text-vice"
                }`}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="text-[9px] uppercase tracking-wider text-muted">{club} · {player.position}</p>
        </div>
        <span className="shrink-0 w-10 text-right text-base font-bold tabular-nums text-brand">
          {player.projectedPoints.toFixed(1)}
        </span>
      </button>
    );
  }

  // pitch (default) – points dominant, name secondary, compact
  return (
    <button type="button" onClick={() => onSelect(player)} className={`${base} flex flex-col px-1.5 py-1.5 min-h-[52px] justify-between sm:px-2 sm:py-2 sm:min-h-[58px]`}>
      <div className="flex items-center justify-between gap-1 min-w-0">
        <p className={`truncate font-medium leading-tight text-white/95 ${nameSizeClass}`} title={player.webName}>
          {displayName}
        </p>
        {badge && (
          <span
            className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
              badge === "C" ? "bg-captain/20 text-captain" : "bg-vice/20 text-vice"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[9px] uppercase tracking-wider text-muted truncate">{club}</span>
        <span className="text-base font-bold tabular-nums leading-none text-brand">
          {player.projectedPoints.toFixed(1)}
        </span>
      </div>
    </button>
  );
}
