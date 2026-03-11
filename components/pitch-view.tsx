import type { PlayerView } from "@/lib/recommendation/types";

interface PitchViewProps {
  startingXI: PlayerView[];
  captainId: number;
  viceId: number;
}

function groupByPosition(players: PlayerView[]) {
  return {
    GK: players.filter((player) => player.position === "GK"),
    DEF: players.filter((player) => player.position === "DEF"),
    MID: players.filter((player) => player.position === "MID"),
    FWD: players.filter((player) => player.position === "FWD"),
  };
}

function PlayerChip({ player, captainId, viceId }: { player: PlayerView; captainId: number; viceId: number }) {
  const isCaptain = player.id === captainId;
  const isVice = player.id === viceId;

  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2 text-center">
      <p className="text-sm font-medium">{player.webName}</p>
      <p className="text-xs text-muted">{player.projectedPoints.toFixed(2)} pts</p>
      <p className="mt-1 text-[10px] text-brand">{isCaptain ? "Captain" : isVice ? "Vice" : ""}</p>
    </div>
  );
}

export function PitchView({ startingXI, captainId, viceId }: PitchViewProps) {
  const grouped = groupByPosition(startingXI);

  return (
    <div className="rounded-card border border-border bg-panel p-4">
      <h2 className="text-lg font-semibold">Starting XI</h2>
      <div className="mt-4 grid gap-3">
        {[grouped.GK, grouped.DEF, grouped.MID, grouped.FWD].map((line, index) => (
          <div key={index} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(line.length, 1)}, minmax(0, 1fr))` }}>
            {line.map((player) => (
              <PlayerChip key={player.id} player={player} captainId={captainId} viceId={viceId} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}