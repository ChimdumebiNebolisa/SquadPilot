"use client";

export interface SquadTopBarProps {
  /** Pre-results: show full CTA. Post-results: compact bar with GW + Regenerate */
  hasResults: boolean;
  nextGw?: number;
  isGenerating: boolean;
  onGenerate: () => void;
}

export function SquadTopBar({ hasResults, nextGw, isGenerating, onGenerate }: SquadTopBarProps) {
  if (hasResults && nextGw != null) {
    return (
      <header className="flex h-11 items-center justify-between px-1">
        <span className="text-sm font-semibold text-foreground">GW {nextGw}</span>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="rounded-lg border border-border/70 bg-panel/80 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-panel disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? "Generating…" : "Regenerate"}
        </button>
      </header>
    );
  }

  return (
    <header className="premium-panel rounded-card border border-border/80 px-3 py-3 sm:px-4 sm:py-4 md:px-5 md:py-5">
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl md:text-2xl">FPL SquadPilot</h1>
          <p className="mt-0.5 text-xs text-muted sm:mt-1 sm:text-sm">
            One click for squad, XI, captain & vice.
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="h-9 shrink-0 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground shadow-[0_8px_20px_rgba(58,162,117,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:h-10 sm:px-4"
        >
          {isGenerating ? "Generating…" : "Generate Squad"}
        </button>
      </div>
    </header>
  );
}
