import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifest = JSON.parse(await readFile(join(root, "data", "historical", "sources.json"), "utf8"));

async function digest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

for (const season of manifest.seasons) {
  const paths = [
    join(root, "data", "historical", `${season}.json.gz`),
    join(root, "data", "backtest", `${season}.json.gz`),
  ];
  const before = await Promise.all(paths.map(digest));
  const result = spawnSync(process.execPath, [join(root, "scripts", "sync-vaastav.mjs"), "--season", season], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Historical re-import failed for ${season}.`);
  const after = await Promise.all(paths.map(digest));
  if (before.some((hash, index) => hash !== after[index])) {
    throw new Error(`Historical re-import for ${season} was not byte-identical.`);
  }
}

console.log("Pinned historical re-import is byte-identical for every shipped season.");
