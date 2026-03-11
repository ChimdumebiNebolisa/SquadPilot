import type { PlayerView } from "@/lib/recommendation/types";

interface BenchRowProps {
  bench: PlayerView[];
  teamShortNames: Record<number, string>;
  selectedPlayerId: number | null;
  onSelect: (player: PlayerView) => void;
}

export function BenchRow({ bench, teamShortNames, selectedPlayerId, onSelect }: BenchRowProps) {
  return (
    <section className="premium-panel rounded-card border border-border/70 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Bench Depth</h3>
        <p className="text-[11px] text-muted">Order 1 → 4</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {bench.map((player, index) => (
          <button
            key={player.id}
            type="button"
            onClick={() => onSelect(player)}
            className={`rounded-xl px-2.5 py-2.5 text-left transition ${
              selectedPlayerId === player.id
                ? "premium-panel-elevated ring-1 ring-brand/65 shadow-[0_0_0_1px_rgba(58,162,117,0.32),0_12px_28px_rgba(4,9,18,0.32)]"
                : "premium-panel shadow-[0_0_0_1px_rgba(39,50,71,0.7),0_8px_24px_rgba(4,9,18,0.22)] hover:shadow-[0_0_0_1px_rgba(66,81,105,0.9),0_10px_26px_rgba(4,9,18,0.26)]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wide text-muted">B{index + 1}</p>
              <p className="text-sm font-semibold text-brand">{player.projectedPoints.toFixed(1)}</p>
            </div>
            <p className="mt-1 text-sm font-medium leading-tight text-white">{player.webName}</p>
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted">
              {teamShortNames[player.teamId] ?? `T${player.teamId}`} · {player.position}
            </p>
            <p className="mt-1 text-[10px] text-muted">5+ {player.chanceOfFivePlusPoints.toFixed(1)}%</p>
          </button>
        ))}
      </div>
    </section>
  );
}