import solver from "javascript-lp-solver";
import type { ProjectedPlayer } from "@/lib/scoring/types";
import type { RecommendationResult } from "@/lib/solver/types";

const BUDGET_CAP = 100;

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
      objective: player.projectedScore * 0.35,
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
      objective: player.projectedScore * 0.65,
      xiCount: 1,
      xiGK: isPosition(player, "GK") ? 1 : 0,
      xiDEFMin: isPosition(player, "DEF") ? 1 : 0,
      xiDEFMax: isPosition(player, "DEF") ? 1 : 0,
      xiMIDMin: isPosition(player, "MID") ? 1 : 0,
      xiMIDMax: isPosition(player, "MID") ? 1 : 0,
      xiFWDMin: isPosition(player, "FWD") ? 1 : 0,
      xiFWDMax: isPosition(player, "FWD") ? 1 : 0,
      [`link_squad_${player.id}`]: 1,
      [`link_captain_${player.id}`]: -1,
    };

    variables[captainVar] = {
      objective: player.projectedScore,
      captainCount: 1,
      [`link_captain_${player.id}`]: 1,
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

function fallbackRecommendation(players: ProjectedPlayer[]): RecommendationResult {
  const ordered = [...players].sort((a, b) => b.projectedScore - a.projectedScore);
  const selectedIds = new Set<number>();
  const teamCounts = new Map<number, number>();

  const squad = [
    ...pickByPosition(ordered, "GK", 2, selectedIds, teamCounts),
    ...pickByPosition(ordered, "DEF", 5, selectedIds, teamCounts),
    ...pickByPosition(ordered, "MID", 5, selectedIds, teamCounts),
    ...pickByPosition(ordered, "FWD", 3, selectedIds, teamCounts),
  ];

  const gk = squad.filter((player) => player.position === "GK").sort((a, b) => b.projectedScore - a.projectedScore);
  const defs = squad.filter((player) => player.position === "DEF").sort((a, b) => b.projectedScore - a.projectedScore);
  const mids = squad.filter((player) => player.position === "MID").sort((a, b) => b.projectedScore - a.projectedScore);
  const fwds = squad.filter((player) => player.position === "FWD").sort((a, b) => b.projectedScore - a.projectedScore);

  const startingXI = [gk[0], ...defs.slice(0, 3), ...mids.slice(0, 4), ...fwds.slice(0, 3)]
    .filter(Boolean)
    .sort((a, b) => b.projectedScore - a.projectedScore);

  const startingIds = new Set(startingXI.map((player) => player.id));
  const bench = squad
    .filter((player) => !startingIds.has(player.id))
    .sort((a, b) => {
      if (a.position === "GK" && b.position !== "GK") return 1;
      if (a.position !== "GK" && b.position === "GK") return -1;
      return b.projectedScore - a.projectedScore;
    });

  const captain = startingXI[0] ?? squad[0];
  const viceCaptain = startingXI[1] ?? startingXI[0] ?? squad[1] ?? squad[0];

  return {
    squad,
    startingXI,
    bench,
    captain,
    viceCaptain,
    budgetUsed: Number(squad.reduce((sum, player) => sum + player.price, 0).toFixed(1)),
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