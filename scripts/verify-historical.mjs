import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const directory = join(process.cwd(), "data", "historical");
const files = existsSync(directory)
  ? readdirSync(directory).filter((name) => name.endsWith(".json.gz"))
  : [];

if (!files.length) {
  throw new Error("No versioned historical snapshots found in data/historical. Run npm run sync:historical -- --season YYYY-YY and commit the .json.gz output.");
}

let records = 0;
for (const file of files) {
  const payload = JSON.parse(gunzipSync(readFileSync(join(directory, file))).toString("utf8"));
  if (!Array.isArray(payload.performances) || payload.performances.length === 0) {
    throw new Error(`Historical snapshot ${file} has no performance records.`);
  }
  records += payload.performances.length;
}

console.log(`Verified ${files.length} historical snapshot(s) with ${records} performance records.`);
