import type { PlayerView } from "@/lib/recommendation/types";

interface BenchRowProps {
  bench: PlayerView[];
  teamShortNames: Record<number, string>;
}

export function BenchRow({ bench, teamShortNames }: BenchRowProps) {
  return (
    <section className="rounded-card border border-border/80 bg-panel p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Bench (lower priority)</h3>
        <p className="text-[11px] text-muted">Order 1 → 4</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {bench.map((player, index) => (
          <div key={player.id} className="rounded-lg border border-border/80 bg-background px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted">B{index + 1}</p>
            <p className="mt-0.5 text-sm font-medium leading-tight text-white">{player.webName}</p>
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted">
              {teamShortNames[player.teamId] ?? `T${player.teamId}`} · {player.position}
            </p>
            <p className="mt-1 text-[11px] font-medium text-brand">
              {player.projectedPoints.toFixed(1)} pts
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}