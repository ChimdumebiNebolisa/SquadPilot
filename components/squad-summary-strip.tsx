"use client";

import type { RecommendationView } from "@/lib/recommendation/types";

export interface SquadSummaryStripProps {
  recommendation: RecommendationView;
}

function formationString(startingXI: RecommendationView["squad"]): string {
  const def = startingXI.filter((p) => p.position === "DEF").length;
  const mid = startingXI.filter((p) => p.position === "MID").length;
  const fwd = startingXI.filter((p) => p.position === "FWD").length;
  return `${def}-${mid}-${fwd}`;
}

export function SquadSummaryStrip({ recommendation }: SquadSummaryStripProps) {
  const byId = new Map(recommendation.squad.map((player) => [player.id, player]));
  const startingXI = recommendation.startingXIIds.flatMap((id) => byId.get(id) ?? []);
  const captain = byId.get(recommendation.captainId);
  const formation = formationString(startingXI);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-panel/60 px-3 py-2.5 min-[480px]:gap-2.5 min-[480px]:px-4 min-[480px]:py-3 md:px-5 md:py-3.5">
      <div className="min-w-0 flex-1 rounded-lg bg-background/35 px-2.5 py-2 min-[480px]:px-3 min-[480px]:py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted leading-snug">Projected</p>
        <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-white min-[480px]:text-base md:text-lg leading-snug">
          {recommendation.projectedTotal.toFixed(1)} pts
          <svg className="h-3.5 w-3.5 text-brand opacity-70" viewBox="0 0 6 10" fill="currentColor" aria-hidden><path d="M0 0l4 5-4 5V0z"/></svg>
        </p>
      </div>
      <div className="min-w-0 flex-1 rounded-lg bg-background/35 px-2.5 py-2 min-[480px]:px-3 min-[480px]:py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted leading-snug">Captain</p>
        <p className="mt-1 truncate text-sm font-semibold text-white min-[480px]:text-base md:text-lg leading-snug">
          {captain?.webName ?? "Unavailable"}
        </p>
        <p className="mt-0.5 flex items-center gap-0.5 text-[11px] text-brand leading-snug">
          {captain?.projectedPoints.toFixed(1) ?? "—"} pts
          <svg className="h-2.5 w-2.5 opacity-70" viewBox="0 0 6 10" fill="currentColor" aria-hidden><path d="M0 0l4 5-4 5V0z"/></svg>
        </p>
      </div>
      <div className="min-w-0 flex-1 rounded-lg bg-background/35 px-2.5 py-2 min-[480px]:px-3 min-[480px]:py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted leading-snug">Formation</p>
        <p className="mt-1 text-sm font-semibold text-white min-[480px]:text-base md:text-lg leading-snug">{formation}</p>
      </div>
    </div>
  );
}
