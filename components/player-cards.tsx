import type { PlayerView } from "@/lib/recommendation/types";

interface PlayerCardsProps {
  players: PlayerView[];
  onSelect: (player: PlayerView) => void;
}

function healthLabel(player: PlayerView): string {
  if (player.status === "a") return "Available";
  if (player.chanceOfPlayingNextRound === null) return "Unknown";
  return `${player.chanceOfPlayingNextRound}% likely`;
}

function fixtureSignal(player: PlayerView): string {
  const fixture = player.contributions.find((item) => item.factor === "fixtureDifficulty");
  const value = fixture?.value ?? 0.5;

  if (value >= 0.67) return "Favorable";
  if (value <= 0.33) return "Tough";
  return "Neutral";
}

function minutesSignal(player: PlayerView): string {
  if (player.chanceOfPlayingNextRound === null) return "Minutes unknown";
  if (player.chanceOfPlayingNextRound >= 85) return "Strong minutes";
  if (player.chanceOfPlayingNextRound >= 60) return "Moderate minutes";
  return "Risky minutes";
}

export function PlayerCards({ players, onSelect }: PlayerCardsProps) {
  return (
    <div className="rounded-card border border-border bg-panel p-4">
      <h3 className="text-sm font-semibold">Recommended Squad</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            onClick={() => onSelect(player)}
            className="rounded-xl border border-border bg-background p-3 text-left transition hover:border-brand"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{player.webName}</p>
                <p className="text-xs text-muted">
                  {player.position} · £{player.price.toFixed(1)}
                </p>
              </div>
              <p className="text-sm font-semibold text-brand">{player.projectedPoints.toFixed(2)} pts</p>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted">
              <span>Fixture: {fixtureSignal(player)}</span>
              <span>Minutes: {minutesSignal(player)}</span>
              <span>Health: {healthLabel(player)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}