import type { PlayerView } from "@/lib/recommendation/types";

interface PlayerCardsProps {
  players: PlayerView[];
  captainId: number;
  viceId: number;
  selectedPlayerId: number | null;
  teamShortNames: Record<number, string>;
  onSelect: (player: PlayerView) => void;
}

function healthLabel(player: PlayerView): string {
  if (player.status === "a") return "Available";
  return "Doubtful";
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
  return (
    <section className="rounded-card border border-border bg-panel p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">Recommended 15</h3>
        <p className="text-xs text-muted">Click a card for detailed reasoning</p>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {players.map((player) => (
          (() => {
            const club = teamShortNames[player.teamId] ?? `T${player.teamId}`;
            return (
          <button
            key={player.id}
            type="button"
            onClick={() => onSelect(player)}
            className={`rounded-lg border p-3 text-left transition ${
              selectedPlayerId === player.id ? "border-brand/80 bg-panel-elevated" : "border-border bg-background hover:border-border/80 hover:bg-panel"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold tracking-tight">{player.webName}</p>
                  {player.id === captainId && (
                    <span className="rounded-md border border-captain/70 bg-captain/15 px-1.5 py-0.5 text-[10px] font-bold text-captain">C</span>
                  )}
                  {player.id === viceId && (
                    <span className="rounded-md border border-vice/70 bg-vice/15 px-1.5 py-0.5 text-[10px] font-bold text-vice">VC</span>
                  )}
                </div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted">
                  {club} · {player.position} · £{player.price.toFixed(1)}m
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold leading-none text-brand">{player.projectedPoints.toFixed(1)}</p>
                <p className="text-[10px] uppercase tracking-[0.08em] text-muted">pts</p>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
              <span className="rounded-md border border-border/80 px-2 py-0.5 text-center text-muted">Minutes {minutesSignal(player)}</span>
              <span className="rounded-md border border-border/80 px-2 py-0.5 text-center text-muted">Fixture {fixtureSignal(player)}</span>
              <span className="rounded-md border border-border/80 px-2 py-0.5 text-center text-muted">Health {healthLabel(player)}</span>
            </div>

            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{player.explanation.summary}</p>
          </button>
            );
          })()
        ))}
      </div>
    </section>
  );
}