import type { FactorContribution, PlayerExplanation } from "@/lib/scoring/types";

interface ExplanationInput {
  position: "GK" | "DEF" | "MID" | "FWD";
  contributions: FactorContribution[];
}

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
  position: ExplanationInput["position"],
  fixture: "Good" | "Neutral" | "Tough",
  minutes: "Strong" | "Likely" | "Unclear",
  value: number,
  seed: number,
  primaryFactor: FactorContribution["factor"],
  secondaryFactor: FactorContribution["factor"],
): string {
  const primaryLabel = factorLabel(primaryFactor);
  const secondaryLabel = factorLabel(secondaryFactor);

  if (position === "MID" || position === "FWD") {
    return pickVariant(
      [
        `Selected for ${primaryLabel} and ${secondaryLabel}.`,
        `Selected for ${primaryLabel} and attacking output.`,
      ],
      seed,
    );
  }

  if (position === "GK") {
    if (minutes === "Strong" && fixture === "Good") return "Selected for expected minutes and fixture.";
    if (value >= 0.7) return "Selected for value and clean-sheet potential.";
    return pickVariant([`Selected for ${primaryLabel} and ${secondaryLabel}.`, "Selected for expected minutes and fixture."], seed);
  }

  if (position === "DEF") {
    if (fixture === "Good" && minutes === "Strong") return "Selected for fixture and expected minutes.";
    if (value >= 0.7) return "Good value and expected minutes.";
    return `Selected for ${primaryLabel} and ${secondaryLabel}.`;
  }

  if (fixture === "Good" && minutes === "Strong") {
    return pickVariant(
      ["Selected for expected minutes and fixture.", "Good expected minutes and fixture."],
      seed,
    );
  }

  if (value >= 0.7) {
    return pickVariant(
      ["Selected for value and expected minutes.", "Good value for price."],
      seed,
    );
  }

  if (minutes === "Likely") {
    return "Selected for expected minutes and floor.";
  }

  return `Selected for ${primaryLabel} and ${secondaryLabel}.`;
}

/** Build downside copy from the actual factor value (0–1) so wording matches the data. */
function downsideFromFactorAndValue(factor: FactorContribution["factor"], value: number): string {
  const low = value < 0.4;
  const midLow = value >= 0.4 && value < 0.55;

  switch (factor) {
    case "expectedMinutes":
      if (low) return "very uncertain minutes.";
      if (midLow) return "minutes on the low side.";
      return "minutes not locked in.";
    case "fixtureDifficulty":
      if (low) return "very tough fixture.";
      if (midLow) return "tougher fixture.";
      return "fixture slightly against.";
    case "recentForm":
      if (low) return "recent form has dipped.";
      if (midLow) return "weaker recent form.";
      return "form not a strength.";
    case "value":
      if (low) return "pricey for output.";
      if (midLow) return "value not great.";
      return "value only okay.";
    case "pointsPerGame":
      if (low) return "low points per game.";
      if (midLow) return "weaker points baseline.";
      return "points baseline modest.";
    case "opponentStrength":
      if (low) return "very strong opposition.";
      if (midLow) return "strong opposition.";
      return "opponent decent.";
    case "homeAway":
      if (low) return "away fixture.";
      return "venue not ideal.";
    case "health":
      if (low) return "availability a concern.";
      return "availability worth watching.";
    case "differential":
      if (low) return "high ownership.";
      if (midLow) return "differential limited.";
      return "ownership not low.";
    case "setPiece":
      if (low) return "no set-piece role.";
      return "set-piece role limited.";
    case "historicalVsOpponent":
      if (low) return "tough historical matchup.";
      if (midLow) return "historical matchup not favorable.";
      return "record vs opponent mixed.";
    default:
      return "strong opposition.";
  }
}

function riskText(
  contributions: FactorContribution[],
  fixture: "Good" | "Neutral" | "Tough",
  minutes: "Strong" | "Likely" | "Unclear",
  health: "Available" | "Doubtful",
  downsideFactor: FactorContribution["factor"],
): string {
  if (health === "Doubtful") return "availability uncertainty.";
  if (minutes === "Unclear") return "uncertain minutes.";
  if (fixture === "Tough") {
    const v = getContribution(contributions, "fixtureDifficulty");
    return downsideFromFactorAndValue("fixtureDifficulty", v);
  }
  const value = getContribution(contributions, downsideFactor);
  return downsideFromFactorAndValue(downsideFactor, value);
}

export function buildPlayerExplanation({ position, contributions }: ExplanationInput, variationOffset = 0): PlayerExplanation {
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
    whyPicked: whyPickedText(position, fixture, minutes, value, seed + 3, leadPositive, secondPositive),
    mainRisk: riskText(contributions, fixture, minutes, healthStatus, leadNegative),
    confidence,
    tags: [`Fixture: ${fixture}`, `Minutes: ${minutes}`, `Health: ${healthStatus}`, `Mode: ${mode}`],
  };
}