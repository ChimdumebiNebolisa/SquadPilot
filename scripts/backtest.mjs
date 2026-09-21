import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildWalkForwardSamples, evaluateModels, loadTrainingSeason } from "./modeling.mjs";

const artifact = JSON.parse(await readFile(join(process.cwd(), "data", "model", "scoring-model.json"), "utf8"));
const validationSnapshot = await loadTrainingSeason(artifact.validationSeason);
const validation = evaluateModels(artifact.models, buildWalkForwardSamples(validationSnapshot.performances));
console.log(JSON.stringify({
  modelVersion: artifact.version,
  trainingSeason: artifact.trainingSeason,
  validationSeason: artifact.validationSeason,
  validation,
  fplExpectedPointsComparator: {
    status: "not-available-in-source-snapshot",
    usage: "comparator-only; never a model input",
  },
}, null, 2));

if (process.argv.includes("--gate") && !validation.releasePassed) process.exitCode = 1;
