export type StartOutlook = "Regular starter" | "Likely starter" | "Rotation risk" | "Unlikely starter";

/** Convert the internal heuristic score into an intentionally broad user-facing label. */
export function startOutlookLabel(estimatePercent: number): StartOutlook {
  if (estimatePercent >= 85) return "Regular starter";
  if (estimatePercent >= 65) return "Likely starter";
  if (estimatePercent >= 35) return "Rotation risk";
  return "Unlikely starter";
}
