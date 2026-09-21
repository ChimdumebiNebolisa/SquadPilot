import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { DataAvailability } from "@/lib/data/types";
import { indexHistoricalDataset, type HistoricalDataset } from "@/lib/historical/normalize";

interface HistoricalFile {
  schemaVersion?: number;
  season?: string;
  recordCount?: number;
  seasonAggregates?: HistoricalDataset["seasonAggregates"];
  opponentAggregates?: HistoricalDataset["opponentAggregates"];
}

let cachedDataset: HistoricalDataset | null | undefined;
let cachedRecordCount = 0;

export function loadHistoricalDataset(): HistoricalDataset | null {
  if (cachedDataset !== undefined) return cachedDataset;
  const directory = join(process.cwd(), "data", "historical");
  if (!existsSync(directory)) {
    cachedDataset = null;
    return cachedDataset;
  }

  const seasonAggregates: HistoricalDataset["seasonAggregates"] = [];
  const opponentAggregates: HistoricalDataset["opponentAggregates"] = [];
  for (const fileName of readdirSync(directory).filter((name) => name.endsWith(".json.gz") || name.endsWith(".json"))) {
    try {
      const bytes = readFileSync(join(directory, fileName));
      const text = fileName.endsWith(".gz") ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
      const parsed = JSON.parse(text) as HistoricalFile;
      if (parsed.schemaVersion !== 2) continue;
      seasonAggregates.push(...(parsed.seasonAggregates ?? []));
      opponentAggregates.push(...(parsed.opponentAggregates ?? []));
      cachedRecordCount += parsed.recordCount ?? 0;
    } catch {
      // A corrupt snapshot should not take down the live recommendation route; the build check
      // prevents a deployment from shipping with no valid snapshot at all.
    }
  }

  cachedDataset = seasonAggregates.length > 0
    ? indexHistoricalDataset([], seasonAggregates, opponentAggregates)
    : null;
  return cachedDataset;
}

export function getHistoricalAvailability(): { status: DataAvailability; records: number } {
  const dataset = loadHistoricalDataset();
  if (!dataset) return { status: "missing", records: 0 };
  return { status: "available", records: cachedRecordCount };
}

export function resetHistoricalDatasetCache(): void {
  cachedDataset = undefined;
  cachedRecordCount = 0;
}
