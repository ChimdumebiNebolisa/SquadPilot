import type { FactorContribution, PlayerExplanation } from "@/lib/scoring/types";

interface ExplanationInput {
  position: "GK" | "DEF" | "MID" | "FWD";
  contributions: FactorContribution[];
  context: {
    projectedPoints: number;
    expectedMinutes: number;
    form: number;
    pointsPerGame: number;
    price: number;
    selectedByPercent: number;
    chanceOfPlayingNextRound: number | null;
    attackingReturns: number;
    fixtures: Array<{
      opponentName?: string;
      isHome: boolean;
      difficulty: number | null;
    }>;
  };
}

type ExplanationContext = NonNullable<ExplanationInput["context"]>;

type NarrativeMode = "upside-first" | "consistency-first" | "fixture-first" | "value-first";

function getContribution(contributions: FactorContribution[], factor: string): number {
  return contributions.find((item) => item.factor === factor)?.value ?? 0;
}

function factorLabel(factor: FactorContribution["factor"]): string {
  if (factor === "recentForm") return "recent form";
  if (factor === "pointsPerGame") return "points per game";
  if (factor === "expectedMinutes") return "expected minutes";
  if (factor === "fixtureDifficulty") return "fixture difficulty";
  if (factor === "homeAway") return "home/away";
  if (factor === "opponentStrength") return "opponent strength";
  if (factor === "value") return "value";
  if (factor === "differential") return "differential";
  if (factor === "health") return "availability";
  if (factor === "setPiece") return "set-piece";
  if (factor === "fplExpectedPoints") return "FPL expected points";
  if (factor === "historicalBaseline") return "historical baseline";
  if (factor === "attackingUpside") return "attacking upside";
  return "opponent";
}

function stableHash(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return Math.abs(hash >>> 0);
}

function contributionSeed(contributions: FactorContribution[]): number {
  const fingerprint = [...contributions]
    .sort((left, right) => left.factor.localeCompare(right.factor))
    .map((item) => `${item.factor}:${Math.round(item.value * 100)}:${Math.round(item.contribution * 100)}`)
    .join("|");

  return stableHash(fingerprint);
}

function topContributors(contributions: FactorContribution[], direction: "positive" | "negative", count: number): FactorContribution[] {
  const sorted = [...contributions].sort((left, right) => right.contribution - left.contribution);

  if (direction === "negative") {
    return sorted.reverse().slice(0, count);
  }

  return sorted.slice(0, count);
}

/** Factors that vary per player (not team-level like fixture/home/opponent). Use these so downsides differ across the squad. */
const PLAYER_SPECIFIC_FACTORS: ReadonlySet<FactorContribution["factor"]> = new Set([
  "recentForm",
  "pointsPerGame",
  "expectedMinutes",
  "value",
  "differential",
  "health",
  "fplExpectedPoints",
  "attackingUpside",
  "historicalBaseline",
]);

/** Downside factor = this player's weakest dimension among player-specific factors (lowest value). Skips team-level and zero-value factors. */
function worstDownsideFactor(contributions: FactorContribution[]): FactorContribution["factor"] {
  const candidate = contributions.filter(
    (c) => PLAYER_SPECIFIC_FACTORS.has(c.factor) && c.value > 0.05,
  );
  if (candidate.length === 0) return "expectedMinutes";
  const byValue = [...candidate].sort((a, b) => a.value - b.value);
  return byValue[0]!.factor;
}

function minutesLabel(expectedMinutes: number): "Strong" | "Likely" | "Unclear" {
  if (expectedMinutes >= 0.85) return "Strong";
  if (expectedMinutes >= 0.65) return "Likely";
  return "Unclear";
}

function fixtureLabel(fixtureDifficulty: number): "Good" | "Neutral" | "Tough" {
  if (fixtureDifficulty >= 0.67) return "Good";
  if (fixtureDifficulty <= 0.33) return "Tough";
  return "Neutral";
}

function healthLabel(health: number): "Available" | "Doubtful" {
  return health >= 0.8 ? "Available" : "Doubtful";
}

function confidenceLabel(minutes: number, health: number, fixture: number, form: number): "High" | "Medium" | "Low" {
  const score = minutes * 0.4 + health * 0.25 + fixture * 0.2 + form * 0.15;
  if (score >= 0.75) return "High";
  if (score >= 0.55) return "Medium";
  return "Low";
}

function seedFromFactors(minutes: number, fixtureDifficulty: number, value: number, form: number): number {
  return Math.round(minutes * 10 + fixtureDifficulty * 7 + value * 11 + form * 13);
}

function pickVariant(options: string[], seed: number): string {
  return options[Math.abs(seed) % options.length] ?? options[0] ?? "";
}

function pickMode(position: ExplanationInput["position"], seed: number): NarrativeMode {
  const modesByPosition: Record<ExplanationInput["position"], NarrativeMode[]> = {
    GK: ["consistency-first", "fixture-first", "value-first", "upside-first"],
    DEF: ["fixture-first", "consistency-first", "value-first", "upside-first"],
    MID: ["upside-first", "consistency-first", "fixture-first", "value-first"],
    FWD: ["upside-first", "fixture-first", "consistency-first", "value-first"],
  };

  return pickVariant(modesByPosition[position], seed) as NarrativeMode;
}

function summaryByRole(
  position: ExplanationInput["position"],
  value: number,
  form: number,
  minutes: number,
  fixture: "Good" | "Neutral" | "Tough",
  seed: number,
  mode: NarrativeMode,
  leadFactor: FactorContribution["factor"],
): string {
  const leadLabel = factorLabel(leadFactor);

  if (mode === "upside-first") {
    return pickVariant(
      [
        `${position} profile leans on upside through ${leadLabel} and attacking projection.`,
        `${position} pick is ceiling-oriented, with ${leadLabel} driving the edge this week.`,
      ],
      seed,
    );
  }

  if (mode === "fixture-first") {
    return pickVariant(
      [
        `${position} slot is optimized for matchup context, with ${leadLabel} reinforcing the call.`,
        `${position} selection is matchup-led and supported by ${leadLabel}.`,
      ],
      seed,
    );
  }

  if (mode === "value-first") {
    return pickVariant(
      [
        `${position} inclusion prioritizes price efficiency while retaining projection stability.`,
        `${position} choice is value-led, balancing spend with reliable output signals.`,
      ],
      seed,
    );
  }

  if (position === "GK") {
    if (value >= 0.7) {
      return pickVariant(
        [
          "Budget keeper with a stable baseline and good short-term value.",
          "Goalkeeper pick leans on price efficiency with a reliable floor.",
        ],
        seed,
      );
    }

    if (minutes >= 0.85) {
      return pickVariant(
        [
          "Goalkeeper slot locked for role security and clean projected minutes.",
          "Keeper included for dependable starts and steady baseline output.",
        ],
        seed,
      );
    }

    return fixture === "Tough"
      ? "Keeper chosen for baseline safety even with a tougher fixture context."
      : "Goalkeeper included for balanced short-term returns and squad stability.";
  }

  if (position === "DEF") {
    if (form >= 0.7) {
      return pickVariant(
        [
          "In-form defender with enough consistency to hold a strong floor.",
          "Defender selected for recent stability and repeatable week-to-week output.",
        ],
        seed,
      );
    }

    if (value >= 0.7) {
      return "Value defender who keeps the structure efficient without sacrificing baseline points.";
    }

    return "Defensive slot filled for minutes stability and balanced squad shape.";
  }

  if (position === "MID") {
    if (form >= 0.75) {
      return pickVariant(
        [
          "Midfield pick rides strong form with dependable involvement.",
          "Chosen in midfield for repeatable returns and recent momentum.",
        ],
        seed,
      );
    }

    if (value >= 0.7) {
      return "Midfield value play offering efficient points at this price band.";
    }

    return "Midfielder chosen as a balanced floor-and-upside option.";
  }

  if (form >= 0.75) {
    return "Forward selected for current form and reliable attacking involvement.";
  }

  if (minutes >= 0.85) {
    return "Forward picked for role security and clean projected minutes in attack.";
  }

  return "Attacking spot used for structure with a practical floor this week.";
}

function whyPickedText(
  primaryFactor: FactorContribution["factor"],
  secondaryFactor: FactorContribution["factor"],
  context: ExplanationContext,
): string {
  const evidence = [
    evidenceForFactor(primaryFactor, context),
    evidenceForFactor(secondaryFactor, context),
  ].filter((item, index, items) => items.indexOf(item) === index);

  return `Projects for ${context.projectedPoints.toFixed(1)} points, supported by ${joinEvidence(evidence)}.`;
}

function fixtureEvidence(context: ExplanationContext): string {
  if (context.fixtures.length === 0) return "the upcoming schedule";
  if (context.fixtures.length > 1) return `${context.fixtures.length} fixtures this gameweek`;

  const fixture = context.fixtures[0]!;
  const opponent = fixture.opponentName ? ` against ${fixture.opponentName}` : "";
  const difficulty = fixture.difficulty == null ? "" : `, rated ${fixture.difficulty}/5`;
  return `a ${fixture.isHome ? "home" : "away"} fixture${opponent}${difficulty}`;
}

function evidenceForFactor(factor: FactorContribution["factor"], context: ExplanationContext): string {
  switch (factor) {
    case "recentForm":
      return `recent form of ${context.form.toFixed(1)} points per match`;
    case "pointsPerGame":
      return `a ${context.pointsPerGame.toFixed(1)} season points-per-match average`;
    case "expectedMinutes":
      return `${Math.round(context.expectedMinutes)} projected minutes`;
    case "fixtureDifficulty":
    case "homeAway":
    case "opponentStrength":
      return fixtureEvidence(context);
    case "value":
      return `value at £${context.price.toFixed(1)}m`;
    case "differential":
      return `${context.selectedByPercent.toFixed(1)}% ownership`;
    case "health":
      return context.chanceOfPlayingNextRound == null
        ? "no reported availability concern"
        : `${Math.round(context.chanceOfPlayingNextRound)}% reported availability`;
    case "setPiece":
      return "set-piece involvement";
    case "historicalVsOpponent":
      return "his previous-season record against the opponent";
    case "historicalBaseline":
      return "his previous-season performance baseline";
    case "attackingUpside":
      return context.attackingReturns > 0
        ? `${context.attackingReturns} league goal contribution${context.attackingReturns === 1 ? "" : "s"}`
        : "attacking involvement";
    case "fplExpectedPoints":
      return "the official FPL points forecast";
  }
}

function joinEvidence(evidence: string[]): string {
  if (evidence.length === 0) return "his strongest model signals";
  if (evidence.length === 1) return evidence[0]!;
  return `${evidence[0]} and ${evidence[1]}`;
}

function riskText(
  fixture: "Good" | "Neutral" | "Tough",
  downsideFactor: FactorContribution["factor"],
  context: ExplanationContext,
): string {
  if (context.chanceOfPlayingNextRound != null && context.chanceOfPlayingNextRound < 100) {
    return `FPL reports ${Math.round(context.chanceOfPlayingNextRound)}% availability, so his minutes carry added risk.`;
  }
  if (context.expectedMinutes < 65) {
    return `Only ${Math.round(context.expectedMinutes)} minutes are projected, making the return sensitive to selection and substitutions.`;
  }
  if (fixture === "Tough") {
    const toughest = [...context.fixtures]
      .filter((item) => item.difficulty != null)
      .sort((left, right) => (right.difficulty ?? 0) - (left.difficulty ?? 0))[0];
    if (toughest) {
      const opponent = toughest.opponentName ? ` against ${toughest.opponentName}` : "";
      return `The ${toughest.isHome ? "home" : "away"} fixture${opponent} is rated ${toughest.difficulty}/5, which lowers this gameweek projection.`;
    }
  }

  switch (downsideFactor) {
    case "recentForm":
      return `Recent form is ${context.form.toFixed(1)} points per match, below the stronger options in the pool.`;
    case "pointsPerGame":
      return `The season average is ${context.pointsPerGame.toFixed(1)} points per match, leaving less margin if the upside does not land.`;
    case "value":
      return `At £${context.price.toFixed(1)}m, the points-per-million case is weaker than the alternatives.`;
    case "differential":
      return `${context.selectedByPercent.toFixed(1)}% ownership offers little differential value.`;
    case "attackingUpside":
      return context.attackingReturns > 0
        ? `He has ${context.attackingReturns} league goal contribution${context.attackingReturns === 1 ? "" : "s"}, so attacking upside is not the main source of the projection.`
        : "He has no league goal contributions yet, so the projection relies on other routes to points.";
    default:
      return "There is no major availability flag; normal gameweek variance remains the main risk.";
  }
}

export function buildPlayerExplanation({ position, contributions, context }: ExplanationInput, variationOffset = 0): PlayerExplanation {
  const recentForm = getContribution(contributions, "recentForm");
  const expectedMinutes = getContribution(contributions, "expectedMinutes");
  const fixtureDifficulty = getContribution(contributions, "fixtureDifficulty");
  const value = getContribution(contributions, "value");
  const health = getContribution(contributions, "health");

  const minutes = minutesLabel(expectedMinutes);
  const fixture = fixtureLabel(fixtureDifficulty);
  const healthStatus = healthLabel(health);
  const confidence = confidenceLabel(expectedMinutes, health, fixtureDifficulty, recentForm);
  const profileSeed = contributionSeed(contributions);
  const seed = seedFromFactors(expectedMinutes, fixtureDifficulty, value, recentForm) + profileSeed + variationOffset * 17;
  const mode = pickMode(position, seed + 5);
  const positives = topContributors(contributions, "positive", 2);
  const leadPositive = positives[0]?.factor ?? "recentForm";
  const secondPositive = positives[1]?.factor ?? "expectedMinutes";
  const leadNegative = worstDownsideFactor(contributions);

  return {
    summary: summaryByRole(position, value, recentForm, expectedMinutes, fixture, seed, mode, leadPositive),
    whyPicked: whyPickedText(leadPositive, secondPositive, context),
    mainRisk: riskText(fixture, leadNegative, context),
    confidence,
    tags: [`Fixture: ${fixture}`, `Minutes: ${minutes}`, `Health: ${healthStatus}`, `Mode: ${mode}`],
  };
}
