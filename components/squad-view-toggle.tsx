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
      {/* Pitch tab commented out – list view only */}
      {/* <button
        type="button"
        role="tab"
        aria-selected={value === "pitch"}
        onClick={() => onChange("pitch")}
        className={...}
      >
        Pitch
      </button> */}
      <button
        type="button"
        role="tab"
        aria-selected={value === "list"}
        onClick={() => onChange("list")}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition min-[480px]:px-4 min-[480px]:py-2 min-[480px]:text-sm ${
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
