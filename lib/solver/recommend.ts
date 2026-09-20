import solver from "javascript-lp-solver";
import { buildPlayerExplanation } from "@/lib/scoring/explain";
import type { ProjectedPlayer } from "@/lib/scoring/types";
import type { RecommendationResult } from "@/lib/solver/types";

export const BUDGET_CAP = 100;

export function hasLegalCaptainLinks(
  startingXI: ProjectedPlayer[],
  captain: ProjectedPlayer | undefined,
  viceCaptain: ProjectedPlayer | undefined,
): boolean {
  if (!captain || !viceCaptain || captain.id === viceCaptain.id) return false;
  const startingIds = new Set(startingXI.map((player) => player.id));
  return startingIds.has(captain.id) && startingIds.has(viceCaptain.id);
}

function objectiveValue(player: ProjectedPlayer): number {
  return player.projectedScore + (player.fivePlusPointsEstimate / 100) * 0.3;
}

function normalizeInsightText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function insightKey(player: ProjectedPlayer): string {
  return `${normalizeInsightText(player.explanation.summary)}|${normalizeInsightText(player.explanation.whyPicked)}`;
}

function enforceDistinctSquadInsights(squad: ProjectedPlayer[]): void {
  const seen = new Set<string>();

  for (const player of [...squad].sort((left, right) => right.projectedScore - left.projectedScore)) {
    let currentKey = insightKey(player);

    if (!seen.has(currentKey)) {
      seen.add(currentKey);
      continue;
    }

    for (let variationOffset = 1; variationOffset <= 6; variationOffset += 1) {
      const candidate = buildPlayerExplanation(
        {
          position: player.position,
          contributions: player.contributions,
        },
        variationOffset,
      );

      const candidateKey = `${normalizeInsightText(candidate.summary)}|${normalizeInsightText(candidate.whyPicked)}`;

      if (!seen.has(candidateKey)) {
        player.explanation = candidate;
        currentKey = candidateKey;
        break;
      }
    }

    seen.add(currentKey);
  }
}

function isPosition(player: ProjectedPlayer, position: ProjectedPlayer["position"]): boolean {
  return player.position === position;
}

function buildCandidatePool(players: ProjectedPlayer[]): ProjectedPlayer[] {
  const byPosition = {
    GK: players.filter((player) => player.position === "GK"),
    DEF: players.filter((player) => player.position === "DEF"),
    MID: players.filter((player) => player.position === "MID"),
    FWD: players.filter((player) => player.position === "FWD"),
  };

  const top = (list: ProjectedPlayer[], count: number) => [...list].sort((a, b) => b.projectedScore - a.projectedScore).slice(0, count);
  const cheap = (list: ProjectedPlayer[], count: number) => [...list].sort((a, b) => a.price - b.price).slice(0, count);

  const candidates = [
    ...top(byPosition.GK, 24),
    ...cheap(byPosition.GK, 8),
    ...top(byPosition.DEF, 70),
    ...cheap(byPosition.DEF, 16),
    ...top(byPosition.MID, 70),
    ...cheap(byPosition.MID, 16),
    ...top(byPosition.FWD, 45),
    ...cheap(byPosition.FWD, 12),
  ];

  const deduped = new Map<number, ProjectedPlayer>();
  for (const player of candidates) {
    deduped.set(player.id, player);
  }

  return [...deduped.values()];
}

function createMilpRecommendation(players: ProjectedPlayer[]): RecommendationResult | null {
  const candidates = buildCandidatePool(players);

  if (candidates.length < 15) {
    return null;
  }

  const constraints: Record<string, Record<string, number>> = {
    squadCount: { equal: 15 },
    budget: { max: BUDGET_CAP },
    squadGK: { equal: 2 },
    squadDEF: { equal: 5 },
    squadMID: { equal: 5 },
    squadFWD: { equal: 3 },
    xiCount: { equal: 11 },
    xiGK: { equal: 1 },
    xiDEFMin: { min: 3 },
    xiDEFMax: { max: 5 },
    xiMIDMin: { min: 2 },
    xiMIDMax: { max: 5 },
    xiFWDMin: { min: 1 },
    xiFWDMax: { max: 3 },
    captainCount: { equal: 1 },
  };

  const variables: Record<string, Record<string, number>> = {};
  const binaries: Record<string, 1> = {};

  for (const player of candidates) {
    const squadVar = `s_${player.id}`;
    const xiVar = `x_${player.id}`;
    const captainVar = `c_${player.id}`;

    variables[squadVar] = {
      objective: objectiveValue(player) * 0.35,
      squadCount: 1,
      budget: player.price,
      [`club_${player.teamId}`]: 1,
      squadGK: isPosition(player, "GK") ? 1 : 0,
      squadDEF: isPosition(player, "DEF") ? 1 : 0,
      squadMID: isPosition(player, "MID") ? 1 : 0,
      squadFWD: isPosition(player, "FWD") ? 1 : 0,
      [`link_squad_${player.id}`]: 1,
    };

    variables[xiVar] = {
      objective: objectiveValue(player) * 0.65,
      xiCount: 1,
      xiGK: isPosition(player, "GK") ? 1 : 0,
      xiDEFMin: isPosition(player, "DEF") ? 1 : 0,
      xiDEFMax: isPosition(player, "DEF") ? 1 : 0,
      xiMIDMin: isPosition(player, "MID") ? 1 : 0,
      xiMIDMax: isPosition(player, "MID") ? 1 : 0,
      xiFWDMin: isPosition(player, "FWD") ? 1 : 0,
      xiFWDMax: isPosition(player, "FWD") ? 1 : 0,
      [`link_squad_${player.id}`]: -1,
      [`link_captain_${player.id}`]: 1,
    };

    variables[captainVar] = {
      objective: objectiveValue(player),
      captainCount: 1,
      [`link_captain_${player.id}`]: -1,
    };

    constraints[`club_${player.teamId}`] = { max: 3 };
    constraints[`link_squad_${player.id}`] = { min: 0 };
    constraints[`link_captain_${player.id}`] = { min: 0 };

    binaries[squadVar] = 1;
    binaries[xiVar] = 1;
    binaries[captainVar] = 1;
  }

  const model = {
    optimize: "objective",
    opType: "max" as const,
    constraints,
    variables,
    binaries,
  };

  const result = solver.Solve(model);

  if (!result.feasible) {
    return null;
  }

  const isSelected = (value: unknown): boolean => typeof value === "number" && value >= 0.5;

  const squad = candidates.filter((player) => isSelected(result[`s_${player.id}`]));
  const startingXI = candidates.filter((player) => isSelected(result[`x_${player.id}`]));
  const captain = candidates.find((player) => isSelected(result[`c_${player.id}`]));

  if (squad.length !== 15 || startingXI.length !== 11 || !captain) {
    return null;
  }

  const startingIds = new Set(startingXI.map((player) => player.id));
  const bench = squad
    .filter((player) => !startingIds.has(player.id))
    .sort((a, b) => {
      if (a.position === "GK" && b.position !== "GK") return 1;
      if (a.position !== "GK" && b.position === "GK") return -1;
      return b.projectedScore - a.projectedScore;
    });

  const viceCaptain = startingXI
    .filter((player) => player.id !== captain.id)
    .sort((a, b) => b.projectedScore - a.projectedScore)[0];

  if (!hasLegalCaptainLinks(startingXI, captain, viceCaptain) || bench.length !== 4 || startingXI.some((player) => !squad.some((squadPlayer) => squadPlayer.id === player.id))) {
    return null;
  }

  const budgetUsed = Number(squad.reduce((sum, player) => sum + player.price, 0).toFixed(1));
  if (budgetUsed > BUDGET_CAP) return null;

  enforceDistinctSquadInsights(squad);

  return {
    squad,
    startingXI: [...startingXI].sort((a, b) => b.projectedScore - a.projectedScore),
    bench,
    captain,
    viceCaptain,
    budgetUsed,
    solver: {
      mode: "solver",
      status: "optimal_or_feasible",
    },
  };
}

export function chooseBestStartingXI(squad: ProjectedPlayer[]): ProjectedPlayer[] | null {
  const byPosition = {
    GK: squad.filter((player) => player.position === "GK").sort((a, b) => objectiveValue(b) - objectiveValue(a)),
    DEF: squad.filter((player) => player.position === "DEF").sort((a, b) => objectiveValue(b) - objectiveValue(a)),
    MID: squad.filter((player) => player.position === "MID").sort((a, b) => objectiveValue(b) - objectiveValue(a)),
    FWD: squad.filter((player) => player.position === "FWD").sort((a, b) => objectiveValue(b) - objectiveValue(a)),
  };
  if (!byPosition.GK[0]) return null;

  let best: ProjectedPlayer[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let defenders = 3; defenders <= 5; defenders += 1) {
    for (let midfielders = 2; midfielders <= 5; midfielders += 1) {
      const forwards = 10 - defenders - midfielders;
      if (forwards < 1 || forwards > 3) continue;
      if (byPosition.DEF.length < defenders || byPosition.MID.length < midfielders || byPosition.FWD.length < forwards) continue;
      const candidate = [
        byPosition.GK[0],
        ...byPosition.DEF.slice(0, defenders),
        ...byPosition.MID.slice(0, midfielders),
        ...byPosition.FWD.slice(0, forwards),
      ];
      const score = candidate.reduce((sum, player) => sum + objectiveValue(player), 0);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return best;
}

function buildCheapestValidSquad(players: ProjectedPlayer[]): ProjectedPlayer[] | null {
  const selected: ProjectedPlayer[] = [];
  const teamCounts = new Map<number, number>();
  const requirements: Array<[ProjectedPlayer["position"], number]> = [["GK", 2], ["DEF", 5], ["MID", 5], ["FWD", 3]];
  for (const [position, count] of requirements) {
    const candidates = players
      .filter((player) => player.position === position)
      .sort((left, right) => left.price - right.price || objectiveValue(right) - objectiveValue(left));
    for (const player of candidates) {
      if (selected.some((picked) => picked.id === player.id)) continue;
      if ((teamCounts.get(player.teamId) ?? 0) >= 3) continue;
      selected.push(player);
      teamCounts.set(player.teamId, (teamCounts.get(player.teamId) ?? 0) + 1);
      if (selected.filter((picked) => picked.position === position).length === count) break;
    }
    if (selected.filter((picked) => picked.position === position).length !== count) return null;
  }
  return selected;
}

function upgradeWithinBudget(squad: ProjectedPlayer[], players: ProjectedPlayer[]): ProjectedPlayer[] {
  const selected = new Map(squad.map((player) => [player.id, player]));
  const teamCounts = new Map<number, number>();
  for (const player of squad) teamCounts.set(player.teamId, (teamCounts.get(player.teamId) ?? 0) + 1);
  let budgetUsed = squad.reduce((sum, player) => sum + player.price, 0);
  const replacements = [...players].sort((left, right) => objectiveValue(right) - objectiveValue(left));
  for (const candidate of replacements) {
    if (selected.has(candidate.id)) continue;
    const samePosition = [...selected.values()].find(
      (player) => player.position === candidate.position && objectiveValue(player) < objectiveValue(candidate),
    );
    if (!samePosition) continue;
    const nextBudget = budgetUsed - samePosition.price + candidate.price;
    const nextTeamCount = (teamCounts.get(candidate.teamId) ?? 0) + (candidate.teamId === samePosition.teamId ? 0 : 1);
    const currentTeamCount = teamCounts.get(samePosition.teamId) ?? 0;
    if (nextBudget > BUDGET_CAP || nextTeamCount > 3) continue;
    selected.delete(samePosition.id);
    selected.set(candidate.id, candidate);
    teamCounts.set(samePosition.teamId, currentTeamCount - 1);
    teamCounts.set(candidate.teamId, nextTeamCount);
    budgetUsed = nextBudget;
  }
  return [...selected.values()];
}

export function fallbackRecommendation(players: ProjectedPlayer[]): RecommendationResult | null {
  const cheapest = buildCheapestValidSquad(players);
  if (!cheapest) return null;
  const squad = upgradeWithinBudget(cheapest, players);
  const budgetUsed = Number(squad.reduce((sum, player) => sum + player.price, 0).toFixed(1));
  if (squad.length !== 15 || budgetUsed > BUDGET_CAP) return null;
  const startingXI = chooseBestStartingXI(squad);
  if (!startingXI || startingXI.length !== 11) return null;

  const startingIds = new Set(startingXI.map((player) => player.id));
  const bench = squad
    .filter((player) => !startingIds.has(player.id))
    .sort((a, b) => {
      if (a.position === "GK" && b.position !== "GK") return 1;
      if (a.position !== "GK" && b.position === "GK") return -1;
      return b.projectedScore - a.projectedScore;
    });

  const captain = [...startingXI].sort((a, b) => objectiveValue(b) - objectiveValue(a))[0];
  const viceCaptain = [...startingXI]
    .filter((player) => player.id !== captain?.id)
    .sort((a, b) => objectiveValue(b) - objectiveValue(a))[0];

  if (!hasLegalCaptainLinks(startingXI, captain, viceCaptain)) return null;

  enforceDistinctSquadInsights(squad);

  return {
    squad,
    startingXI,
    bench,
    captain,
    viceCaptain,
    budgetUsed,
    solver: {
      mode: "fallback",
      status: "greedy_fallback",
    },
  };
}

export function buildRecommendation(players: ProjectedPlayer[]): RecommendationResult | null {
  const solverResult = createMilpRecommendation(players);

  if (solverResult) {
    return solverResult;
  }

  return fallbackRecommendation(players);
}
