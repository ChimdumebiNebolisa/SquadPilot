"use client";

import type { RecommendationView } from "@/lib/recommendation/types";

export interface SquadSummaryStripProps {
  recommendation: RecommendationView;
}

function formationString(startingXI: RecommendationView["startingXI"]): string {
  const gk = startingXI.filter((p) => p.position === "GK").length;
  const def = startingXI.filter((p) => p.position === "DEF").length;
  const mid = startingXI.filter((p) => p.position === "MID").length;
  const fwd = startingXI.filter((p) => p.position === "FWD").length;
  return `${def}-${mid}-${fwd}`;
}

export function SquadSummaryStrip({ recommendation }: SquadSummaryStripProps) {
  const totalProjected = recommendation.startingXI.reduce((sum, p) => sum + p.projectedPoints, 0);
  const formation = formationString(recommendation.startingXI);

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-panel/60 px-2.5 py-2 sm:gap-2 sm:px-3 sm:py-2 md:px-4 md:py-2.5">
      <div className="min-w-0 flex-1 rounded-lg bg-background/35 px-2 py-1.5 sm:px-2.5 sm:py-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">Projected</p>
        <p className="mt-0.5 text-sm font-semibold tracking-tight text-white sm:text-base md:text-lg">
          {totalProjected.toFixed(1)} pts
        </p>
      </div>
      <div className="min-w-0 flex-1 rounded-lg bg-background/35 px-2 py-1.5 sm:px-2.5 sm:py-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">Captain</p>
        <p className="mt-0.5 truncate text-sm font-semibold tracking-tight text-white sm:text-base md:text-lg">
          {recommendation.captain.webName}
        </p>
        <p className="text-[10px] text-brand">{recommendation.captain.projectedPoints.toFixed(1)} pts</p>
      </div>
      <div className="min-w-0 flex-1 rounded-lg bg-background/35 px-2 py-1.5 sm:px-2.5 sm:py-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">Formation</p>
        <p className="mt-0.5 text-sm font-semibold tracking-tight text-white sm:text-base md:text-lg">{formation}</p>
      </div>
    </div>
  );
}
