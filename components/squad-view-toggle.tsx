"use client";

export type SquadViewMode = "pitch" | "list";

export interface SquadViewToggleProps {
  value: SquadViewMode;
  onChange: (mode: SquadViewMode) => void;
}

export function SquadViewToggle({ value, onChange }: SquadViewToggleProps) {
  return (
    <div
      className="inline-flex rounded-xl border border-border/60 bg-panel/60 p-0.5"
      role="tablist"
      aria-label="View mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "pitch"}
        onClick={() => onChange("pitch")}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:py-2 sm:text-sm ${
          value === "pitch"
            ? "bg-panel-elevated text-white shadow-sm"
            : "text-muted hover:text-foreground"
        }`}
      >
        Pitch
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "list"}
        onClick={() => onChange("list")}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:py-2 sm:text-sm ${
          value === "list"
            ? "bg-panel-elevated text-white shadow-sm"
            : "text-muted hover:text-foreground"
        }`}
      >
        List
      </button>
    </div>
  );
}
