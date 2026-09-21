import type { NormalizedFixture, NormalizedTeam, PlayerFixtureView } from "@/lib/fpl/types";

export interface TeamFixtureSummary {
  fixtures: PlayerFixtureView[];
  fixtureCount: number;
  averageDifficulty: number | null;
  homeCount: number;
  awayCount: number;
  status: "available" | "partial" | "missing";
}

export function getFixturesForTeamAndEvent(
  teamId: number,
  eventId: number,
  fixtures: NormalizedFixture[],
  teams: NormalizedTeam[] = [],
): TeamFixtureSummary {
  const teamCodeById = new Map(teams.map((team) => [team.id, team.code]));
  const teamFixtures = fixtures
    .filter((fixture) => fixture.event === eventId && (fixture.teamH === teamId || fixture.teamA === teamId))
    .map((fixture) => {
      const isHome = fixture.teamH === teamId;
      return {
        fixtureId: fixture.id,
        event: eventId,
        opponentTeamId: isHome ? fixture.teamA : fixture.teamH,
        opponentTeamCode: teamCodeById.get(isHome ? fixture.teamA : fixture.teamH) ?? 0,
        isHome,
        difficulty: isHome ? fixture.teamHDifficulty : fixture.teamADifficulty,
        kickoffTime: fixture.kickoffTime,
        source: fixture.source.source,
      } satisfies PlayerFixtureView;
    });

  const knownDifficulties = teamFixtures
    .map((fixture) => fixture.difficulty)
    .filter((difficulty): difficulty is number => difficulty != null);

  return {
    fixtures: teamFixtures,
    fixtureCount: teamFixtures.length,
    averageDifficulty: knownDifficulties.length
      ? knownDifficulties.reduce((sum, difficulty) => sum + difficulty, 0) / knownDifficulties.length
      : null,
    homeCount: teamFixtures.filter((fixture) => fixture.isHome).length,
    awayCount: teamFixtures.filter((fixture) => !fixture.isHome).length,
    status: teamFixtures.length === 0
      ? "missing"
      : knownDifficulties.length === teamFixtures.length
        ? "available"
        : "partial",
  };
}

export function countCompletedTeamFixtures(teamId: number, fixtures: NormalizedFixture[]): number {
  return fixtures.filter(
    (fixture) =>
      fixture.event != null &&
      (fixture.finished || fixture.finishedProvisional) &&
      (fixture.teamH === teamId || fixture.teamA === teamId),
  ).length;
}

/** Use the opponent's defensive strength at the venue where the match is played. */
export function opponentDefenceStrength(
  opponent: NormalizedTeam | undefined,
  playerIsHome: boolean,
): number | null {
  if (!opponent) return null;
  return playerIsHome ? opponent.strengthDefenceAway ?? opponent.strengthOverallAway : opponent.strengthDefenceHome ?? opponent.strengthOverallHome;
}
