import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DataAvailability } from "@/lib/data/types";
import type { HistoricalDataset } from "@/lib/historical/normalize";

interface HistoricalFile {
  season?: string;
  performances?: HistoricalDataset["performances"];
  seasonAggregates?: HistoricalDataset["seasonAggregates"];
  opponentAggregates?: HistoricalDataset["opponentAggregates"];
}

let cachedDataset: HistoricalDataset | null | undefined;

export function loadHistoricalDataset(): HistoricalDataset | null {
  if (cachedDataset !== undefined) return cachedDataset;
  const directory = join(process.cwd(), "data", "historical");
  if (!existsSync(directory)) {
    cachedDataset = null;
    return cachedDataset;
  }

  const combined: HistoricalDataset = { performances: [], seasonAggregates: [], opponentAggregates: [] };
  for (const fileName of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    try {
      const parsed = JSON.parse(readFileSync(join(directory, fileName), "utf8")) as HistoricalFile;
      combined.performances.push(...(parsed.performances ?? []));
      combined.seasonAggregates.push(...(parsed.seasonAggregates ?? []));
      combined.opponentAggregates.push(...(parsed.opponentAggregates ?? []));
    } catch {
      // A corrupt optional historical file should not take down the live recommendation route.
    }
  }

  cachedDataset = combined.performances.length > 0 ? combined : null;
  return cachedDataset;
}

export function getHistoricalAvailability(): { status: DataAvailability; records: number } {
  const dataset = loadHistoricalDataset();
  if (!dataset) return { status: "missing", records: 0 };
  return { status: "available", records: dataset.performances.length };
}

export function resetHistoricalDatasetCache(): void {
  cachedDataset = undefined;
}
