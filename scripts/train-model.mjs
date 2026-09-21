import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BASE_FIVE_PLUS_FEATURES,
  buildWalkForwardSamples,
  compareProbabilityModels,
  evaluateModels,
  FIVE_PLUS_FEATURES,
  loadTrainingSeason,
  MODEL_FEATURES,
  PLAYER_HISTORY_FIVE_PLUS_FEATURES,
  probabilityDiagnostics,
  trainDoubleGameweekCalibration,
  trainModels,
} from "./modeling.mjs";

const trainingHistorySeason = "2023-24";
const trainingSeason = "2024-25";
const validationSeason = "2025-26";
const runtimeHistorySeason = validationSeason;
const historyPenaltyMultiplier = 4096;
const trainingHistorySnapshot = await loadTrainingSeason(trainingHistorySeason);
const trainingSnapshot = await loadTrainingSeason(trainingSeason);
const validationSnapshot = await loadTrainingSeason(validationSeason);
const trainingSamples = buildWalkForwardSamples(
  trainingSnapshot.performances,
  trainingHistorySnapshot.performances,
);
const validationSamples = buildWalkForwardSamples(
  validationSnapshot.performances,
  trainingSnapshot.performances,
);
const trainSpecification = (fivePlusFeatures, useHistoryPenalty = false) => {
  const penaltyMultipliers = useHistoryPenalty
    ? Object.fromEntries(FIVE_PLUS_FEATURES
      .filter((feature) => !BASE_FIVE_PLUS_FEATURES.includes(feature))
      .map((feature) => [feature, historyPenaltyMultiplier]))
    : {};
  const models = trainModels(trainingSamples, fivePlusFeatures, { penaltyMultipliers });
  return {
    fivePlusFeatures,
    models,
    doubleGameweekFivePlusCalibration: trainDoubleGameweekCalibration(
      models,
      trainingSamples,
      fivePlusFeatures,
    ),
  };
};
const incumbent = trainSpecification(BASE_FIVE_PLUS_FEATURES);
const playerHistoryAblation = trainSpecification(PLAYER_HISTORY_FIVE_PLUS_FEATURES, true);
const candidate = trainSpecification(FIVE_PLUS_FEATURES, true);
const validation = evaluateModels(
  candidate.models,
  validationSamples,
  candidate.doubleGameweekFivePlusCalibration,
  candidate.fivePlusFeatures,
);
const incumbentValidation = evaluateModels(
  incumbent.models,
  validationSamples,
  incumbent.doubleGameweekFivePlusCalibration,
  incumbent.fivePlusFeatures,
);
const playerHistoryValidation = evaluateModels(
  playerHistoryAblation.models,
  validationSamples,
  playerHistoryAblation.doubleGameweekFivePlusCalibration,
  playerHistoryAblation.fivePlusFeatures,
);
const comparison = compareProbabilityModels(candidate, incumbent, validationSamples);
validation.releaseGates = {
  ...validation.releaseGates,
  ...comparison.gates,
};
validation.releasePassed = Object.values(validation.releaseGates).every(Boolean);
const incumbentSignature = createHash("sha256").update(JSON.stringify(incumbent)).digest("hex").slice(0, 12);
const diagnostics = {
  ...probabilityDiagnostics(candidate, validationSamples),
  ablation: {
    incumbent: {
      features: BASE_FIVE_PLUS_FEATURES,
      brierScore: incumbentValidation.brierScore,
      expectedCalibrationError: incumbentValidation.expectedCalibrationError,
      rocAuc: incumbentValidation.rocAuc,
      activeCandidateBrierScore: incumbentValidation.activeCandidates.brierScore,
      activeCandidateRocAuc: incumbentValidation.activeCandidates.rocAuc,
    },
    playerHistory: {
      features: PLAYER_HISTORY_FIVE_PLUS_FEATURES,
      brierScore: playerHistoryValidation.brierScore,
      expectedCalibrationError: playerHistoryValidation.expectedCalibrationError,
      rocAuc: playerHistoryValidation.rocAuc,
      activeCandidateBrierScore: playerHistoryValidation.activeCandidates.brierScore,
      activeCandidateRocAuc: playerHistoryValidation.activeCandidates.rocAuc,
    },
    playerAndOpponentHistory: {
      features: FIVE_PLUS_FEATURES,
      brierScore: validation.brierScore,
      expectedCalibrationError: validation.expectedCalibrationError,
      rocAuc: validation.rocAuc,
      activeCandidateBrierScore: validation.activeCandidates.brierScore,
      activeCandidateRocAuc: validation.activeCandidates.rocAuc,
    },
  },
};

const content = {
  schemaVersion: 4,
  features: MODEL_FEATURES,
  fivePlusFeatures: FIVE_PLUS_FEATURES,
  historyTreatment: "previous-season-player-and-opponent",
  historyLookbackSeasons: 1,
  historyPenaltyMultiplier,
  trainingHistorySeason,
  trainingSeason,
  validationSeason,
  runtimeHistorySeason,
  sourceCommit: trainingSnapshot.source.commitSha,
  models: candidate.models,
  doubleGameweekFivePlusCalibration: candidate.doubleGameweekFivePlusCalibration,
  validation,
  incumbentComparison: {
    incumbentSignature,
    ...comparison,
  },
  diagnostics,
};
const contentHash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
const artifact = {
  ...content,
  version: contentHash.slice(0, 12),
  contentHash,
};

const outputDirectory = join(process.cwd(), "data", "model");
console.log(JSON.stringify({
  candidateVersion: artifact.version,
  incumbentSignature,
  trainingSamples: trainingSamples.length,
  validation,
  comparison,
  diagnostics,
}, null, 2));

if (!validation.releasePassed) {
  process.exitCode = 1;
} else {
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, "scoring-model.json");
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}
