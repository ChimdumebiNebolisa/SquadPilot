import type { PlayerView } from "@/lib/recommendation/types";

interface BenchRowProps {
  bench: PlayerView[];
}

export function BenchRow({ bench }: BenchRowProps) {
  return (
    <div className="rounded-card border border-border bg-panel p-4">
      <h3 className="text-sm font-semibold">Bench Order</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {bench.map((player, index) => (
          <div key={player.id} className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs text-muted">Bench {index + 1}</p>
            <p className="text-sm font-medium">{player.webName}</p>
            <p className="text-xs text-muted">
              {player.position} · {player.projectedPoints.toFixed(2)} pts
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}