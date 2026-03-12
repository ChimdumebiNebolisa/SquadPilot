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
  /* Pitch: allow up to 12 chars so two-line wrap shows more; list/bench unchanged */
  const maxLen = variant === "pitch" ? 12 : variant === "list" ? 18 : 12;
  const nameClass = variant === "pitch" ? "text-[10px] leading-snug min-[480px]:text-[11px]" : "text-[11px] leading-snug min-[480px]:text-xs";
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
        className={`${base} flex items-center gap-2 px-2 py-1.5 min-h-[40px] min-[480px]:gap-2.5 min-[480px]:px-2.5 min-[480px]:py-2 min-[480px]:min-h-[44px]`}
      >
        {slotLabel && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted">{slotLabel}</span>
        )}
        <div className="min-w-0 flex-1 text-left">
          <p className={`truncate font-medium text-white/95 ${nameSizeClass}`} title={player.webName}>
            {displayName}
          </p>
          <p className="text-[10px] leading-snug uppercase tracking-wider text-muted">{club}</p>
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
        className={`${base} flex items-center gap-2.5 px-3 py-2 min-h-[44px] min-[480px]:gap-3 min-[480px]:px-3.5 min-[480px]:py-2.5 min-[480px]:min-h-[48px]`}
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
          <p className="text-[10px] leading-snug uppercase tracking-wider text-muted">{club} · {player.position}</p>
        </div>
        <span className="shrink-0 w-10 text-right text-base font-bold tabular-nums text-brand">
          {player.projectedPoints.toFixed(1)}
        </span>
      </button>
    );
  }

  // pitch: name, club, vs opponent, C/VC; on mobile hide points until card is clicked
  const opponent =
    player.opponentTeamId != null ? teamShortNames[player.opponentTeamId] ?? `T${player.opponentTeamId}` : null;
  const showPoints = isSelected; // on mobile show points only when selected; on desktop show always (see className)

  return (
    <button type="button" onClick={() => onSelect(player)} className={`${base} flex flex-col px-1.5 py-1.5 min-h-[80px] justify-between min-[480px]:min-h-[58px] min-[480px]:px-2 min-[480px]:py-2`}>
      <div className="flex items-start justify-between gap-1 min-w-0">
        <p className={`min-w-0 font-medium leading-tight text-white/95 line-clamp-2 ${nameSizeClass}`} title={player.webName}>
          {displayName}
        </p>
        {badge && (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              badge === "C" ? "bg-captain/20 text-captain" : "bg-vice/20 text-vice"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-1.5 min-w-0">
        <div className="min-w-0 flex flex-col items-start gap-0.5">
          <span className="text-[10px] leading-snug uppercase tracking-wider text-muted truncate max-w-full">{club}</span>
          {opponent != null && (
            <span className="text-[9px] leading-snug uppercase tracking-wider text-muted/80 truncate max-w-full">
              vs {opponent}
            </span>
          )}
        </div>
        <span
          className={`shrink-0 text-base font-bold tabular-nums leading-none text-brand ${showPoints ? "inline" : "hidden min-[480px]:inline"}`}
        >
          {player.projectedPoints.toFixed(1)}
        </span>
      </div>
    </button>
  );
}
