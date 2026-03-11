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
  if (factor === "pointsPerGame") return "points baseline";
  if (factor === "expectedMinutes") return "minutes security";
  if (factor === "fixtureDifficulty") return "fixture setup";
  if (factor === "homeAway") return "venue context";
  if (factor === "opponentStrength") return "opponent profile";
  if (factor === "value") return "price efficiency";
  if (factor === "differential") return "differential edge";
  if (factor === "health") return "availability";
  if (factor === "setPiece") return "set-piece role";
  return "historical matchup";
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
        `Picked because ${primaryLabel} and ${secondaryLabel} combine for one of the stronger attacking profiles in this pool.`,
        `Picked for attacking slots where ${primaryLabel} and ${secondaryLabel} both clear the selection bar.`,
      ],
      seed,
    );
  }

  if (fixture === "Good" && minutes === "Strong") {
    return pickVariant(
      [
        "Picked for role security and a favorable setup this gameweek.",
        "Picked because both fixture context and expected minutes rate well.",
      ],
      seed,
    );
  }

  if (value >= 0.7) {
    return pickVariant(
      [
        "Picked for value efficiency versus similarly priced alternatives.",
        "Picked as a price-efficient route to stable projected output.",
      ],
      seed,
    );
  }

  if (minutes === "Likely") {
    return "Picked more for floor and role stability than pure upside chasing.";
  }

  return "Picked to keep balance across the XI while preserving short-term projection.";
}

function riskText(
  fixture: "Good" | "Neutral" | "Tough",
  minutes: "Strong" | "Likely" | "Unclear",
  health: "Available" | "Doubtful",
  seed: number,
  downsideFactor: FactorContribution["factor"],
): string {
  const downsideLabel = factorLabel(downsideFactor);

  if (health === "Doubtful") {
    return pickVariant(
      [
        "Risk: availability uncertainty could cap minutes and reduce return.",
        "Risk: fitness uncertainty remains the main downside in this spot.",
      ],
      seed,
    );
  }

  if (minutes === "Unclear") {
    return "Risk: uncertain minutes can limit reliability even when the baseline projection is acceptable.";
  }

  if (fixture === "Tough") {
    return pickVariant(
      [
        "Risk: fixture could limit upside even if the minutes look safe.",
        "Risk: tougher opposition lowers ceiling despite a stable role.",
      ],
      seed,
    );
  }

  return pickVariant(
    [
      `Risk: ${downsideLabel} is the weakest signal and could cap upside versus alternatives.`,
      "Risk: profile is stable, but this reads more as floor security than pure ceiling chasing.",
    ],
    seed,
  );
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
  const negatives = topContributors(contributions, "negative", 1);
  const leadPositive = positives[0]?.factor ?? "recentForm";
  const secondPositive = positives[1]?.factor ?? "expectedMinutes";
  const leadNegative = negatives[0]?.factor ?? "fixtureDifficulty";

  return {
    summary: summaryByRole(position, value, recentForm, expectedMinutes, fixture, seed, mode, leadPositive),
    whyPicked: whyPickedText(position, fixture, minutes, value, seed + 3, leadPositive, secondPositive),
    mainRisk: riskText(fixture, minutes, healthStatus, seed + 7, leadNegative),
    confidence,
    tags: [`Fixture: ${fixture}`, `Minutes: ${minutes}`, `Health: ${healthStatus}`, `Mode: ${mode}`],
  };
}