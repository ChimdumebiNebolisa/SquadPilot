import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BASE_FIVE_PLUS_FEATURES,
  buildWalkForwardSamples,
  compareProbabilityModels,
  evaluateModels,
  loadTrainingSeason,
  probabilityDiagnostics,
  trainDoubleGameweekCalibration,
  trainModels,
} from "./modeling.mjs";

const artifact = JSON.parse(await readFile(join(process.cwd(), "data", "model", "scoring-model.json"), "utf8"));
const trainingHistorySnapshot = await loadTrainingSeason(artifact.trainingHistorySeason);
const trainingSnapshot = await loadTrainingSeason(artifact.trainingSeason);
const validationSnapshot = await loadTrainingSeason(artifact.validationSeason);
const trainingSamples = buildWalkForwardSamples(
  trainingSnapshot.performances,
  trainingHistorySnapshot.performances,
);
const validationSamples = buildWalkForwardSamples(
  validationSnapshot.performances,
  trainingSnapshot.performances,
);
const validation = evaluateModels(
  artifact.models,
  validationSamples,
  artifact.doubleGameweekFivePlusCalibration,
  artifact.fivePlusFeatures,
);
const incumbentModels = trainModels(trainingSamples, BASE_FIVE_PLUS_FEATURES);
const incumbent = {
  fivePlusFeatures: BASE_FIVE_PLUS_FEATURES,
  models: incumbentModels,
  doubleGameweekFivePlusCalibration: trainDoubleGameweekCalibration(
    incumbentModels,
    trainingSamples,
    BASE_FIVE_PLUS_FEATURES,
  ),
};
const candidate = {
  fivePlusFeatures: artifact.fivePlusFeatures,
  models: artifact.models,
  doubleGameweekFivePlusCalibration: artifact.doubleGameweekFivePlusCalibration,
};
const comparison = compareProbabilityModels(candidate, incumbent, validationSamples);
validation.releaseGates = { ...validation.releaseGates, ...comparison.gates };
validation.releasePassed = Object.values(validation.releaseGates).every(Boolean);
console.log(JSON.stringify({
  modelVersion: artifact.version,
  trainingSeason: artifact.trainingSeason,
  validationSeason: artifact.validationSeason,
  validation,
  incumbentComparison: comparison,
  diagnostics: probabilityDiagnostics(candidate, validationSamples),
  fplExpectedPointsComparator: {
    status: "excluded-from-normalized-training-snapshot",
    usage: "comparator-only; never a model input",
  },
}, null, 2));

if (process.argv.includes("--gate") && !validation.releasePassed) process.exitCode = 1;
