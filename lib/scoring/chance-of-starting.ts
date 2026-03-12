import type { NormalizedPlayer } from "@/lib/fpl/types";

/**
 * Deterministic % chance of starting (0–100).
 * Uses: FPL availability (chance_of_playing_next_round, status) and season minutes history.
 */
export function computeChanceOfStarting(
  player: NormalizedPlayer,
  gameweeksPlayed: number,
): number {
  // 1. Availability (0–1): likelihood they are fit/available for the next round
  const availability =
    player.chanceOfPlayingNextRound !== null
      ? Math.max(0, Math.min(1, player.chanceOfPlayingNextRound / 100))
      : availabilityFromStatus(player.status);

  // 2. Historical start rate (0–1): when available, how often they get “starter” minutes
  const startRate =
    gameweeksPlayed > 0
      ? Math.min(1, player.minutesPlayedSeason / (gameweeksPlayed * 90))
      : priorStartRate(player.position);

  // 3. P(start) ≈ P(available) × P(starts when available)
  const raw = availability * startRate * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

function availabilityFromStatus(status: string): number {
  switch (status) {
    case "a":
      return 0.85;
    case "d":
      return 0.4;
    case "i":
    case "s":
      return 0.15;
    default:
      return 0.6;
  }
}

function priorStartRate(position: NormalizedPlayer["position"]): number {
  // No season data: GK more likely to be nailed; outfield conservative
  return position === "GK" ? 0.75 : 0.65;
}
