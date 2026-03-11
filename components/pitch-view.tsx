import type { PlayerView } from "@/lib/recommendation/types";

interface PitchViewProps {
  startingXI: PlayerView[];
  captainId: number;
  viceId: number;
  teamShortNames: Record<number, string>;
  selectedPlayerId: number | null;
  onSelect: (player: PlayerView) => void;
}

function groupByPosition(players: PlayerView[]) {
  return {
    GK: players.filter((player) => player.position === "GK"),
    DEF: players.filter((player) => player.position === "DEF"),
    MID: players.filter((player) => player.position === "MID"),
    FWD: players.filter((player) => player.position === "FWD"),
  };
}

function PlayerChip({
  player,
  captainId,
  viceId,
  teamShortNames,
  selectedPlayerId,
  onSelect,
}: {
  player: PlayerView;
  captainId: number;
  viceId: number;
  teamShortNames: Record<number, string>;
  selectedPlayerId: number | null;
  onSelect: (player: PlayerView) => void;
}) {
  const isCaptain = player.id === captainId;
  const isVice = player.id === viceId;
  const isSelected = player.id === selectedPlayerId;
  const club = teamShortNames[player.teamId] ?? `T${player.teamId}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(player)}
      className={`relative rounded-lg border px-3 py-2.5 text-center transition ${
        isSelected
          ? "border-brand/80 bg-panel-elevated"
          :
        isCaptain
          ? "border-captain/80 bg-captain/8"
          : isVice
            ? "border-vice/80 bg-vice/8"
            : "border-border bg-panel hover:border-border/80 hover:bg-panel-elevated"
      }`}
    >
      <div className="absolute right-2 top-2 flex gap-1">
        {isCaptain && <span className="rounded-md border border-captain/70 bg-captain/15 px-1.5 py-0.5 text-[10px] font-bold text-captain">C</span>}
        {isVice && <span className="rounded-md border border-vice/70 bg-vice/15 px-1.5 py-0.5 text-[10px] font-bold text-vice">VC</span>}
      </div>
      <p className="pr-8 text-sm font-semibold tracking-tight leading-tight text-white">{player.webName}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-muted">
        {club} · {player.position}
      </p>
      <p className="mt-1 text-xs font-medium text-brand">{player.projectedPoints.toFixed(1)} pts</p>
      <p className="text-[10px] text-muted">5+ {player.chanceOfFivePlusPoints.toFixed(1)}%</p>
    </button>
  );
}

export function PitchView({ startingXI, captainId, viceId, teamShortNames, selectedPlayerId, onSelect }: PitchViewProps) {
  const grouped = groupByPosition(startingXI);

  return (
    <section className="rounded-card border border-border bg-panel p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Starting XI</h2>
        <p className="text-xs text-muted">Primary lineup board</p>
      </div>
      <div className="football-grid mt-4 rounded-2xl border border-border bg-panel-elevated p-4 md:p-5">
        {[grouped.GK, grouped.DEF, grouped.MID, grouped.FWD].map((line, index) => (
          <div
            key={index}
            className="mb-3 grid gap-2.5 last:mb-0"
            style={{ gridTemplateColumns: `repeat(${Math.max(line.length, 1)}, minmax(0, 1fr))` }}
          >
            {line.map((player) => (
              <PlayerChip
                key={player.id}
                player={player}
                captainId={captainId}
                viceId={viceId}
                teamShortNames={teamShortNames}
                selectedPlayerId={selectedPlayerId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}