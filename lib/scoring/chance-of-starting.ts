import type { NormalizedFixture, NormalizedPlayer } from "@/lib/fpl/types";

export interface StartEstimateContext {
  completedTeamFixtures: number;
  upcomingFixtureCount: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function availabilityFromStatus(status: string): number {
  if (status === "a") return 1;
  if (status === "d") return 0.4;
  if (status === "i" || status === "s") return 0.05;
  return 0.6;
}

/**
 * Deterministic start estimate. It is deliberately not called a probability:
 * it uses historical starts per actual team fixture, availability, and a
 * small double-gameweek rotation adjustment.
 */
export function computeStartEstimate(player: NormalizedPlayer, context: StartEstimateContext): number {
  const availability = player.chanceOfPlayingNextRound !== null
    ? clamp(player.chanceOfPlayingNextRound / 100)
    : availabilityFromStatus(player.status);
  const selectionRate = context.completedTeamFixtures > 0
    ? clamp(player.starts / context.completedTeamFixtures)
    : player.position === "GK" ? 0.75 : 0.65;
  const rotationAdjustment = context.upcomingFixtureCount > 1
    ? Math.max(0.7, 1 - 0.1 * (context.upcomingFixtureCount - 1))
    : 1;
  return Math.round(clamp(availability * selectionRate * rotationAdjustment) * 100);
}

/** Count actual completed fixtures, not gameweeks. Provisionally finished matches count as completed. */
export function countCompletedFixturesForTeam(teamId: number, fixtures: NormalizedFixture[]): number {
  return fixtures.filter(
    (fixture) =>
      fixture.event != null &&
      (fixture.finished || fixture.finishedProvisional) &&
      (fixture.teamH === teamId || fixture.teamA === teamId),
  ).length;
}
