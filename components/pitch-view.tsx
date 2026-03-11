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

function roleBadge(playerId: number, captainId: number, viceId: number): "C" | "VC" | null {
  if (playerId === captainId) return "C";
  if (playerId === viceId) return "VC";
  return null;
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
  const badge = roleBadge(player.id, captainId, viceId);

  return (
    <button
      type="button"
      onClick={() => onSelect(player)}
      className={`relative w-full rounded-xl px-3 py-3 text-left transition focus-visible:outline-none ${
        isSelected
          ? "premium-panel-elevated ring-1 ring-brand/70 shadow-[0_0_0_1px_rgba(58,162,117,0.35),0_18px_36px_rgba(3,10,20,0.42)]"
          : isCaptain
            ? "premium-panel shadow-[0_0_0_1px_rgba(245,207,89,0.38),0_10px_30px_rgba(5,10,20,0.28)]"
            : isVice
              ? "premium-panel shadow-[0_0_0_1px_rgba(117,200,255,0.35),0_10px_30px_rgba(5,10,20,0.28)]"
              : "premium-panel shadow-[0_0_0_1px_rgba(39,50,71,0.8),0_10px_30px_rgba(5,10,20,0.26)] hover:shadow-[0_0_0_1px_rgba(66,81,105,0.95),0_14px_34px_rgba(5,10,20,0.32)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-white">{player.webName}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted">
            {club} · {player.position}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold leading-none text-brand">{player.projectedPoints.toFixed(1)}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-muted">pts</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium text-muted">5+ {player.chanceOfFivePlusPoints.toFixed(1)}%</p>
        {badge ? (
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] ${
              badge === "C" ? "bg-captain/15 text-captain" : "bg-vice/15 text-vice"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export function PitchView({ startingXI, captainId, viceId, teamShortNames, selectedPlayerId, onSelect }: PitchViewProps) {
  const grouped = groupByPosition(startingXI);
  const lines = [
    { key: "GK", players: grouped.GK, maxWidth: "max-w-[240px]", gap: "mb-10" },
    { key: "DEF", players: grouped.DEF, maxWidth: "max-w-[880px]", gap: "mb-11" },
    { key: "MID", players: grouped.MID, maxWidth: "max-w-[940px]", gap: "mb-11" },
    { key: "FWD", players: grouped.FWD, maxWidth: "max-w-[760px]", gap: "mb-0" },
  ] as const;

  return (
    <section className="premium-panel rounded-card border border-border/80 p-5 md:p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Hero Squad</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Starting XI</h2>
        </div>
        <p className="text-xs text-muted">Formation-first board</p>
      </div>
      <div className="pitch-surface mt-5 rounded-2xl border border-border/70 p-5 md:p-6">
        <div className="pointer-events-none absolute left-1/2 top-[18%] h-14 w-14 -translate-x-1/2 rounded-full border border-border/35" />
        <div className="pointer-events-none absolute left-6 right-6 top-1/2 h-px bg-border/40" />
        {lines.map((line, index) => (
          <div
            key={line.key}
            className={`${line.gap} mx-auto grid w-full ${line.maxWidth} gap-2.5 md:gap-3`}
            style={{ gridTemplateColumns: `repeat(${Math.max(line.players.length, 1)}, minmax(0, 1fr))` }}
          >
            {line.players.map((player) => (
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
            {line.players.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/70 py-6 text-center text-xs text-muted">No player in this line</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}