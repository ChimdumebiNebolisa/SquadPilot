import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const season = process.argv[process.argv.indexOf("--season") + 1] || "2024-25";
if (!/^\d{4}-\d{2}$/.test(season)) {
  throw new Error("Use --season YYYY-YY, for example --season 2024-25");
}

const base = `https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/${season}`;
const urls = [
  `${base}/gws/merged_gw.csv`,
  `${base}/fixtures.csv`,
  `${base}/players_raw.csv`,
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

const responses = await Promise.all(urls.map(async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Vaastav download failed (${response.status}): ${url}`);
  return response.text();
}));

const rows = parseCsv(responses[0]);
const playerRows = parseCsv(responses[2]);
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const playerMetadata = new Map(playerRows.map((row) => [number(row.id || row.element), row]));
const positionName = (row) => {
  const raw = row.position || row.element_type || "";
  return { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" }[raw] || raw || null;
};
const asNullableNumber = (value) => value === "" ? null : number(value);
const asBool = (value) => value === "1" || value === "true";
const asOf = new Date().toISOString();
const performances = rows
  .map((row) => {
    const playerId = number(row.element);
    const fixtureId = number(row.fixture);
    const gameweek = number(row.round);
    if (!playerId || !fixtureId || !gameweek) return null;
    const position = positionName(playerMetadata.get(playerId) || row);
    if (!["GK", "DEF", "MID", "FWD"].includes(position)) return null;
    return {
      source: {
        source: "vaastav-historical",
        season,
        gameweek,
        fixtureId,
        asOf,
        confidence: row.opponent_team ? "high" : "low",
        availability: row.opponent_team ? "available" : "partial",
      },
      playerId,
      playerName: row.name || null,
      position,
      teamId: asNullableNumber(row.team),
      opponentTeamId: asNullableNumber(row.opponent_team),
      wasHome: row.was_home === "" ? null : asBool(row.was_home),
      minutes: number(row.minutes),
      // Preserve the source starts field. Minutes are not a substitute for starts.
      starts: number(row.starts),
      totalPoints: number(row.total_points),
      goals: number(row.goals_scored),
      assists: number(row.assists),
      expectedGoals: asNullableNumber(row.expected_goals),
      expectedAssists: asNullableNumber(row.expected_assists),
    };
  })
  .filter(Boolean);

const seasonMap = new Map();
const opponentMap = new Map();
for (const record of performances) {
  const seasonKey = String(record.playerId);
  const seasonAggregate = seasonMap.get(seasonKey) || { playerId: record.playerId, playerName: record.playerName, matches: 0, starts: 0, minutes: 0, totalPoints: 0, goals: 0, assists: 0, homeMatches: 0, awayMatches: 0 };
  seasonAggregate.matches += 1;
  seasonAggregate.starts += record.starts;
  seasonAggregate.minutes += record.minutes;
  seasonAggregate.totalPoints += record.totalPoints;
  seasonAggregate.goals += record.goals;
  seasonAggregate.assists += record.assists;
  if (record.wasHome === true) seasonAggregate.homeMatches += 1;
  if (record.wasHome === false) seasonAggregate.awayMatches += 1;
  seasonMap.set(seasonKey, seasonAggregate);
  if (record.opponentTeamId == null) continue;
  const opponentKey = `${record.playerId}:${record.opponentTeamId}`;
  const aggregate = opponentMap.get(opponentKey) || { playerId: record.playerId, playerName: record.playerName, opponentTeamId: record.opponentTeamId, matches: 0, starts: 0, minutes: 0, totalPoints: 0, homeMatches: 0, awayMatches: 0 };
  aggregate.matches += 1;
  aggregate.starts += record.starts;
  aggregate.minutes += record.minutes;
  aggregate.totalPoints += record.totalPoints;
  if (record.wasHome === true) aggregate.homeMatches += 1;
  if (record.wasHome === false) aggregate.awayMatches += 1;
  opponentMap.set(opponentKey, aggregate);
}

const aggregates = [...seasonMap.values()].map((aggregate) => ({
  source: { source: "vaastav-historical", season, gameweek: null, fixtureId: null, asOf, confidence: "high", availability: "available" },
  ...aggregate,
  season,
  pointsPer90: aggregate.minutes ? aggregate.totalPoints / aggregate.minutes * 90 : 0,
}));
const opponentAggregates = [...opponentMap.values()].map((aggregate) => {
  const baseline = aggregates.find((item) => item.playerId === aggregate.playerId)?.pointsPer90 || 0;
  const pointsPer90 = aggregate.minutes ? aggregate.totalPoints / aggregate.minutes * 90 : 0;
  const shrinkWeight = aggregate.matches / (aggregate.matches + 4);
  return {
    source: { source: "vaastav-historical", season, gameweek: null, fixtureId: null, asOf, confidence: "high", availability: "available" },
    ...aggregate,
    pointsPer90,
    shrunkPointsPer90: pointsPer90 * shrinkWeight + baseline * (1 - shrinkWeight),
    sampleSize: aggregate.matches,
    dataStatus: "available",
  };
});

const outputDirectory = join(process.cwd(), "data", "historical");
await mkdir(outputDirectory, { recursive: true });
const payload = JSON.stringify({ season, importedAt: asOf, performances, seasonAggregates: aggregates, opponentAggregates });
await writeFile(join(outputDirectory, `${season}.json.gz`), gzipSync(payload, { level: 9 }));
console.log(`Imported ${performances.length} match records for ${season} into data/historical/${season}.json.gz. Fixtures and players_raw were downloaded for reproducibility; application normalization uses the match records.`);
