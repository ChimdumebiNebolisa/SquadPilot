"use client";

export interface SquadTopBarProps {
  /** Pre-results: show full CTA. Post-results: compact bar with GW + Regenerate */
  hasResults: boolean;
  nextGw?: number;
  isGenerating: boolean;
  onGenerate: () => void;
  teamId: string;
  onTeamIdChange: (value: string) => void;
}

export function SquadTopBar({ hasResults, nextGw, isGenerating, onGenerate, teamId, onTeamIdChange }: SquadTopBarProps) {
  if (hasResults && nextGw != null) {
    return (
      <header className="flex h-11 items-center justify-between gap-2 px-1">
        <span className="text-sm font-semibold text-foreground">GW {nextGw}</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
            Team ID
            <input
              value={teamId}
              onChange={(event) => onTeamIdChange(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="optional"
              className="h-7 w-20 rounded-md border border-border/70 bg-panel/80 px-1.5 text-xs normal-case tracking-normal text-foreground outline-none focus:border-brand/70"
              aria-label="Optional FPL Team ID"
            />
          </label>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="rounded-lg border border-border/70 bg-panel/80 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-panel disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating…" : "Regenerate"}
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="premium-panel rounded-card border border-border/80 px-3 py-3 min-[480px]:px-4 min-[480px]:py-4 md:px-5 md:py-5">
      <div className="flex flex-wrap items-end justify-between gap-3 min-[480px]:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-white min-[480px]:text-xl md:text-2xl">FPL SquadPilot</h1>
          <p className="mt-0.5 text-xs text-muted leading-snug min-[480px]:mt-1 min-[480px]:text-sm">
            One click for squad, XI, captain & vice.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted">
          <span className="uppercase tracking-wider">Team ID</span>
          <input
            value={teamId}
            onChange={(event) => onTeamIdChange(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="optional"
            className="h-9 w-24 rounded-lg border border-border/70 bg-background/50 px-2 text-sm text-foreground outline-none focus:border-brand/70"
            aria-label="Optional FPL Team ID"
          />
        </label>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="h-9 shrink-0 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground shadow-[0_8px_20px_rgba(58,162,117,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 min-[480px]:h-10 min-[480px]:px-4"
        >
          {isGenerating ? "Generating…" : "Generate Squad"}
        </button>
      </div>
    </header>
  );
}
