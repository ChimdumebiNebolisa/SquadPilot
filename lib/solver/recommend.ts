import solver from "javascript-lp-solver";
import { buildPlayerExplanation } from "@/lib/scoring/explain";
import type { ProjectedPlayer } from "@/lib/scoring/types";
import type { RecommendationResult } from "@/lib/solver/types";

const BUDGET_CAP = 100;

function objectiveValue(player: ProjectedPlayer): number {
  return player.projectedScore + (player.chanceOfFivePlusPoints / 100) * 0.3;
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
      [`link_squad_${player.id}`]: -1,
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
      [`link_squad_${player.id}`]: 1,
      // Captain must be a member of the XI: captain - XI <= 0.
      [`link_captain_${player.id}`]: 1,
    };

    variables[captainVar] = {
      objective: objectiveValue(player),
      captainCount: 1,
      [`link_captain_${player.id}`]: -1,
    };

    constraints[`club_${player.teamId}`] = { max: 3 };
    constraints[`link_squad_${player.id}`] = { max: 0 };
    constraints[`link_captain_${player.id}`] = { max: 0 };

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

  if (!viceCaptain || bench.length !== 4) {
    return null;
  }

  enforceDistinctSquadInsights(squad);

  return {
    squad,
    startingXI: [...startingXI].sort((a, b) => b.projectedScore - a.projectedScore),
    bench,
    captain,
    viceCaptain,
    budgetUsed: Number(squad.reduce((sum, player) => sum + player.price, 0).toFixed(1)),
    solver: {
      mode: "solver",
      status: "optimal_or_feasible",
    },
  };
}

function pickByPosition(
  players: ProjectedPlayer[],
  position: ProjectedPlayer["position"],
  count: number,
  lockedIds: Set<number>,
  teamCounts: Map<number, number>,
): ProjectedPlayer[] {
  const picked: ProjectedPlayer[] = [];

  for (const player of players) {
    if (player.position !== position || lockedIds.has(player.id)) {
      continue;
    }

    const currentTeamCount = teamCounts.get(player.teamId) ?? 0;
    if (currentTeamCount >= 3) {
      continue;
    }

    picked.push(player);
    lockedIds.add(player.id);
    teamCounts.set(player.teamId, currentTeamCount + 1);

    if (picked.length === count) {
      break;
    }
  }

  return picked;
}

const VALID_FORMATIONS: ReadonlyArray<readonly [number, number, number]> = [
  [3, 4, 3],
  [3, 5, 2],
  [4, 3, 3],
  [4, 4, 2],
  [4, 5, 1],
  [5, 3, 2],
  [5, 4, 1],
];

function squadCost(squad: ProjectedPlayer[]): number {
  return squad.reduce((sum, player) => sum + player.price, 0);
}

function canUsePlayer(
  player: ProjectedPlayer,
  selectedIds: Set<number>,
  teamCounts: Map<number, number>,
): boolean {
  if (selectedIds.has(player.id)) return false;
  return (teamCounts.get(player.teamId) ?? 0) < 3;
}

/** Repair the greedy squad until it satisfies the £100 cap without violating club limits. */
function repairFallbackBudget(squad: ProjectedPlayer[], players: ProjectedPlayer[]): ProjectedPlayer[] {
  const selectedIds = new Set(squad.map((player) => player.id));
  const teamCounts = new Map<number, number>();
  for (const player of squad) {
    teamCounts.set(player.teamId, (teamCounts.get(player.teamId) ?? 0) + 1);
  }

  while (squadCost(squad) > BUDGET_CAP) {
    let bestSwap:
      | { outgoingIndex: number; incoming: ProjectedPlayer; savings: number; lossPerSaved: number }
      | undefined;

    for (let outgoingIndex = 0; outgoingIndex < squad.length; outgoingIndex += 1) {
      const outgoing = squad[outgoingIndex];
      const outgoingTeamCount = teamCounts.get(outgoing.teamId) ?? 0;

      for (const incoming of players) {
        if (incoming.position !== outgoing.position || !canUsePlayer(incoming, selectedIds, teamCounts)) {
          continue;
        }

        const savings = outgoing.price - incoming.price;
        if (savings <= 0) continue;

        const incomingTeamCount = teamCounts.get(incoming.teamId) ?? 0;
        if (incoming.teamId === outgoing.teamId) {
          if (incomingTeamCount > outgoingTeamCount) continue;
        } else if (incomingTeamCount >= 3) {
          continue;
        }

        const loss = Math.max(0, outgoing.projectedScore - incoming.projectedScore);
        const candidate = { outgoingIndex, incoming, savings, lossPerSaved: loss / savings };
        if (!bestSwap || candidate.lossPerSaved < bestSwap.lossPerSaved) {
          bestSwap = candidate;
        }
      }
    }

    if (!bestSwap) break;

    const outgoing = squad[bestSwap.outgoingIndex];
    selectedIds.delete(outgoing.id);
    selectedIds.add(bestSwap.incoming.id);
    teamCounts.set(outgoing.teamId, (teamCounts.get(outgoing.teamId) ?? 1) - 1);
    teamCounts.set(bestSwap.incoming.teamId, (teamCounts.get(bestSwap.incoming.teamId) ?? 0) + 1);
    squad[bestSwap.outgoingIndex] = bestSwap.incoming;
  }

  return squad;
}

function selectBestStartingXI(squad: ProjectedPlayer[]): ProjectedPlayer[] {
  const byPosition = (position: ProjectedPlayer["position"]) =>
    squad.filter((player) => player.position === position).sort((a, b) => objectiveValue(b) - objectiveValue(a));

  let best: { xi: ProjectedPlayer[]; objective: number } | undefined;
  for (const [defenders, midfielders, forwards] of VALID_FORMATIONS) {
    const xi = [
      ...byPosition("GK").slice(0, 1),
      ...byPosition("DEF").slice(0, defenders),
      ...byPosition("MID").slice(0, midfielders),
      ...byPosition("FWD").slice(0, forwards),
    ];
    if (xi.length !== 11) continue;
    const objective = xi.reduce((sum, player) => sum + objectiveValue(player), 0);
    if (!best || objective > best.objective) best = { xi, objective };
  }

  return best?.xi ?? [];
}

function fallbackRecommendation(players: ProjectedPlayer[]): RecommendationResult {
  const ordered = [...players].sort((a, b) => b.projectedScore - a.projectedScore);
  const selectedIds = new Set<number>();
  const teamCounts = new Map<number, number>();

  const squad = repairFallbackBudget([
    ...pickByPosition(ordered, "GK", 2, selectedIds, teamCounts),
    ...pickByPosition(ordered, "DEF", 5, selectedIds, teamCounts),
    ...pickByPosition(ordered, "MID", 5, selectedIds, teamCounts),
    ...pickByPosition(ordered, "FWD", 3, selectedIds, teamCounts),
  ], players);

  if (squad.length !== 15 || squadCost(squad) > BUDGET_CAP) {
    throw new Error("Could not build a budget-valid fallback squad");
  }

  const startingXI = selectBestStartingXI(squad);

  const startingIds = new Set(startingXI.map((player) => player.id));
  const bench = squad
    .filter((player) => !startingIds.has(player.id))
    .sort((a, b) => {
      if (a.position === "GK" && b.position !== "GK") return 1;
      if (a.position !== "GK" && b.position === "GK") return -1;
      return b.projectedScore - a.projectedScore;
    });

  const captain = [...startingXI].sort((a, b) => objectiveValue(b) - objectiveValue(a))[0] ?? squad[0];
  const viceCaptain = [...startingXI]
    .filter((player) => player.id !== captain?.id)
    .sort((a, b) => objectiveValue(b) - objectiveValue(a))[0] ?? startingXI[0] ?? squad[1] ?? squad[0];

  enforceDistinctSquadInsights(squad);

  return {
    squad,
    startingXI,
    bench,
    captain,
    viceCaptain,
    budgetUsed: Number(squadCost(squad).toFixed(1)),
    solver: {
      mode: "fallback",
      status: "greedy_fallback",
    },
  };
}

export function buildRecommendation(players: ProjectedPlayer[]): RecommendationResult {
  const solverResult = createMilpRecommendation(players);

  if (solverResult) {
    return solverResult;
  }

  return fallbackRecommendation(players);
}
