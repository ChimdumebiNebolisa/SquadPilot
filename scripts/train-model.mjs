import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildWalkForwardSamples,
  evaluateModels,
  loadTrainingSeason,
  MODEL_FEATURES,
  trainDoubleGameweekCalibration,
  trainModels,
} from "./modeling.mjs";

const trainingSeason = "2024-25";
const validationSeason = "2025-26";
const trainingSnapshot = await loadTrainingSeason(trainingSeason);
const validationSnapshot = await loadTrainingSeason(validationSeason);
const trainingSamples = buildWalkForwardSamples(trainingSnapshot.performances);
const validationSamples = buildWalkForwardSamples(validationSnapshot.performances);
const models = trainModels(trainingSamples);
const doubleGameweekFivePlusCalibration = trainDoubleGameweekCalibration(models, trainingSamples);
const validation = evaluateModels(models, validationSamples, doubleGameweekFivePlusCalibration);

const content = {
  schemaVersion: 2,
  features: MODEL_FEATURES,
  trainingSeason,
  validationSeason,
  sourceCommit: trainingSnapshot.source.commitSha,
  models,
  doubleGameweekFivePlusCalibration,
  validation,
};
const contentHash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
const artifact = {
  ...content,
  version: contentHash.slice(0, 12),
  contentHash,
};

const outputDirectory = join(process.cwd(), "data", "model");
await mkdir(outputDirectory, { recursive: true });
await writeFile(join(outputDirectory, "scoring-model.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ version: artifact.version, trainingSamples: trainingSamples.length, validation }, null, 2));

if (process.argv.includes("--gate") && !validation.releasePassed) {
  process.exitCode = 1;
}
