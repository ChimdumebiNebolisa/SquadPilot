import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

const gunzipAsync = promisify(gunzip);
const root = process.cwd();
const manifest = JSON.parse(await readFile(join(root, "data", "historical", "sources.json"), "utf8"));

if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.commitSha ?? "")) {
  throw new Error("Historical source manifest is invalid or not pinned to a full commit SHA.");
}
if (!Number.isFinite(Date.parse(manifest.commitTimestamp)) || !Array.isArray(manifest.seasons) || manifest.seasons.length < 2) {
  throw new Error("Historical source manifest must include its commit timestamp and both seasons.");
}

let records = 0;
for (const season of manifest.seasons) {
  if (Object.values(manifest.sha256?.[season] ?? {}).length !== 3
    || Object.values(manifest.sha256[season]).some((hash) => !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error(`${season} does not have all three pinned input checksums.`);
  }
  const runtime = JSON.parse((await gunzipAsync(await readFile(join(root, "data", "historical", `${season}.json.gz`)))).toString("utf8"));
  const training = JSON.parse((await gunzipAsync(await readFile(join(root, "data", "backtest", `${season}.json.gz`)))).toString("utf8"));
  for (const [name, payload] of [["runtime", runtime], ["training", training]]) {
    if (payload.schemaVersion !== 2 || payload.season !== season || payload.source?.commitSha !== manifest.commitSha) {
      throw new Error(`${season} ${name} snapshot does not match schema v2 and the pinned source commit.`);
    }
    for (const file of Object.values(payload.source.files ?? {})) {
      if (!/^[a-f0-9]{64}$/.test(file.sha256 ?? "")) throw new Error(`${season} ${name} snapshot has an invalid input hash.`);
    }
    for (const [key, hash] of Object.entries(manifest.sha256[season])) {
      if (payload.source.files?.[key]?.sha256 !== hash) throw new Error(`${season} ${name} snapshot checksum differs from the manifest.`);
    }
  }
  if (!Array.isArray(runtime.seasonAggregates) || !runtime.seasonAggregates.length
    || !Array.isArray(runtime.opponentAggregates) || !runtime.opponentAggregates.length) {
    throw new Error(`${season} runtime snapshot is missing compact aggregates.`);
  }
  if (!Array.isArray(training.performances) || !training.performances.length) {
    throw new Error(`${season} training snapshot has no walk-forward records.`);
  }
  if (runtime.recordCount !== training.performances.length) {
    throw new Error(`${season} runtime record count does not match the training snapshot.`);
  }
  if (training.performances.some((record) => !Number.isInteger(record.playerCode) || !Number.isInteger(record.teamCode) || !Number.isInteger(record.opponentTeamCode))) {
    throw new Error(`${season} training snapshot contains a record without stable player/team identity.`);
  }
  records += training.performances.length;
}

const model = JSON.parse(await readFile(join(root, "data", "model", "scoring-model.json"), "utf8"));
const { version, contentHash, ...content } = model;
const expectedHash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
if (contentHash !== expectedHash || version !== expectedHash.slice(0, 12) || model.validation?.releasePassed !== true) {
  throw new Error("Scoring model artifact hash or validation gate is invalid.");
}

console.log(`Verified ${manifest.seasons.length} schema-v2 season(s), ${records} walk-forward records, and model ${version}.`);
