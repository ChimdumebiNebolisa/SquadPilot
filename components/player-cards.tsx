import type { PlayerView } from "@/lib/recommendation/types";

interface PlayerCardsProps {
  players: PlayerView[];
  captainId: number;
  viceId: number;
  selectedPlayerId: number | null;
  teamShortNames: Record<number, string>;
  onSelect: (player: PlayerView) => void;
}

const POSITION_ORDER: PlayerView["position"][] = ["GK", "DEF", "MID", "FWD"];

function groupedPlayers(players: PlayerView[]): Array<{ position: PlayerView["position"]; players: PlayerView[] }> {
  const sorted = [...players].sort((left, right) => right.projectedPoints - left.projectedPoints);

  return POSITION_ORDER.map((position) => ({
    position,
    players: sorted.filter((player) => player.position === position),
  })).filter((group) => group.players.length > 0);
}

function healthLabel(player: PlayerView): string {
  if (player.status === "a") return "Avail";
  return "Doubt";
}

function fixtureSignal(player: PlayerView): string {
  const fixture = player.contributions.find((item) => item.factor === "fixtureDifficulty");
  const value = fixture?.value ?? 0.5;

  if (value >= 0.67) return "Good";
  if (value <= 0.33) return "Tough";
  return "Neutral";
}

function minutesSignal(player: PlayerView): string {
  if (player.chanceOfPlayingNextRound === null) return "Unclear";
  if (player.chanceOfPlayingNextRound >= 85) return "Strong";
  if (player.chanceOfPlayingNextRound >= 60) return "Likely";
  return "Unclear";
}

export function PlayerCards({ players, captainId, viceId, selectedPlayerId, teamShortNames, onSelect }: PlayerCardsProps) {
  const groups = groupedPlayers(players);

  return (
    <section className="premium-panel rounded-card border border-border/80 p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Squad Depth</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">Recommended 15</h3>
        </div>
        <p className="text-xs text-muted">Ranked by projected points</p>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.position} className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{group.position}</p>
              <p className="text-[11px] text-muted">{group.players.length} players</p>
            </div>

            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {group.players.map((player, index) => {
                const club = teamShortNames[player.teamId] ?? `T${player.teamId}`;

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => onSelect(player)}
                    className={`w-full rounded-xl px-3.5 py-3 text-left transition focus-visible:outline-none ${
                      selectedPlayerId === player.id
                        ? "premium-panel-elevated ring-1 ring-brand/70 shadow-[0_0_0_1px_rgba(58,162,117,0.35),0_16px_32px_rgba(5,10,20,0.38)]"
                        : "premium-panel shadow-[0_0_0_1px_rgba(39,50,71,0.82),0_10px_28px_rgba(5,10,20,0.26)] hover:shadow-[0_0_0_1px_rgba(66,81,105,0.95),0_14px_30px_rgba(5,10,20,0.32)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-muted">#{index + 1}</span>
                          <p className="truncate text-sm font-semibold tracking-tight text-white">{player.webName}</p>
                          {player.id === captainId && <span className="rounded-md bg-captain/15 px-1.5 py-0.5 text-[10px] font-semibold text-captain">C</span>}
                          {player.id === viceId && <span className="rounded-md bg-vice/15 px-1.5 py-0.5 text-[10px] font-semibold text-vice">VC</span>}
                        </div>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-muted">
                          {club} · {player.position} · £{player.price.toFixed(1)}m
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-semibold leading-none text-brand">{player.projectedPoints.toFixed(1)}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-muted">Projected</p>
                        <p className="mt-1 text-[10px] font-medium text-muted">5+ {player.chanceOfFivePlusPoints.toFixed(1)}%</p>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                      <span className="rounded-md bg-background/45 px-2 py-1 text-center text-muted">Min {minutesSignal(player)}</span>
                      <span className="rounded-md bg-background/45 px-2 py-1 text-center text-muted">Fix {fixtureSignal(player)}</span>
                      <span className="rounded-md bg-background/45 px-2 py-1 text-center text-muted">Health {healthLabel(player)}</span>
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{player.explanation.summary}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
