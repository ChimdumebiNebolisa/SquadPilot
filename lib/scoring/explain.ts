import type { FactorContribution, PlayerExplanation } from "@/lib/scoring/types";

interface ExplanationInput {
  position: "GK" | "DEF" | "MID" | "FWD";
  contributions: FactorContribution[];
}

function getContribution(contributions: FactorContribution[], factor: string): number {
  return contributions.find((item) => item.factor === factor)?.value ?? 0;
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

function summaryByRole(
  position: ExplanationInput["position"],
  value: number,
  form: number,
  minutes: number,
  fixture: "Good" | "Neutral" | "Tough",
  seed: number,
): string {
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
): string {
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

  if (position === "FWD") {
    return "Picked as the best projected fit for the attacking slots under current constraints.";
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
): string {
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

  return "Risk: profile is stable, but this is more of a floor play than a ceiling play.";
}

export function buildPlayerExplanation({ position, contributions }: ExplanationInput): PlayerExplanation {
  const recentForm = getContribution(contributions, "recentForm");
  const expectedMinutes = getContribution(contributions, "expectedMinutes");
  const fixtureDifficulty = getContribution(contributions, "fixtureDifficulty");
  const value = getContribution(contributions, "value");
  const health = getContribution(contributions, "health");

  const minutes = minutesLabel(expectedMinutes);
  const fixture = fixtureLabel(fixtureDifficulty);
  const healthStatus = healthLabel(health);
  const confidence = confidenceLabel(expectedMinutes, health, fixtureDifficulty, recentForm);
  const seed = seedFromFactors(expectedMinutes, fixtureDifficulty, value, recentForm);

  return {
    summary: summaryByRole(position, value, recentForm, expectedMinutes, fixture, seed),
    whyPicked: whyPickedText(position, fixture, minutes, value, seed + 3),
    mainRisk: riskText(fixture, minutes, healthStatus, seed + 7),
    confidence,
    tags: [`Fixture: ${fixture}`, `Minutes: ${minutes}`, `Health: ${healthStatus}`],
  };
}