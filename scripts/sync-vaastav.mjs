import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const manifestPath = join(root, "data", "historical", "sources.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const seasonIndex = process.argv.indexOf("--season");
const season = seasonIndex >= 0 ? process.argv[seasonIndex + 1] : manifest.seasons?.[0];

if (!/^\d{4}-\d{2}$/.test(season ?? "") || !manifest.seasons?.includes(season)) {
  throw new Error(`Use --season with one of the pinned seasons: ${(manifest.seasons ?? []).join(", ")}.`);
}
if (!/^[a-f0-9]{40}$/.test(manifest.commitSha ?? "") || !Number.isFinite(Date.parse(manifest.commitTimestamp))) {
  throw new Error("Historical source manifest must contain a full commit SHA and commit timestamp.");
}

const base = `https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/${manifest.commitSha}/data/${season}`;
const inputs = {
  mergedGw: `${base}/gws/merged_gw.csv`,
  fixtures: `${base}/fixtures.csv`,
  players: `${base}/players_raw.csv`,
};

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
  const headers = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label}: ${String(value)}`);
  return parsed;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(value);
}

async function writeGzipAtomically(path, value) {
  const temporary = `${path}.tmp`;
  const bytes = gzipSync(stableJson(value), { level: 9, mtime: 0 });
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

const downloaded = Object.fromEntries(await Promise.all(Object.entries(inputs).map(async ([key, url]) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Vaastav download failed (${response.status}): ${url}`);
  return [key, await response.text()];
})));
for (const [key, contents] of Object.entries(downloaded)) {
  const expected = manifest.sha256?.[season]?.[key];
  if (!/^[a-f0-9]{64}$/.test(expected ?? "")) throw new Error(`Missing pinned checksum for ${season} ${key}.`);
  const actual = sha256(contents);
  if (actual !== expected) throw new Error(`Checksum mismatch for ${season} ${key}: expected ${expected}, received ${actual}.`);
}

const rows = parseCsv(downloaded.mergedGw);
const fixtureRows = parseCsv(downloaded.fixtures);
const playerRows = parseCsv(downloaded.players);
const requiredPlayerColumns = ["id", "code", "team", "team_code", "element_type"];
const requiredGwColumns = ["element", "fixture", "round", "minutes", "total_points", "was_home"];
const requiredFixtureColumns = ["id", "team_h", "team_a"];
for (const column of requiredPlayerColumns) if (!(column in (playerRows[0] ?? {}))) throw new Error(`players_raw.csv is missing ${column}.`);
for (const column of requiredGwColumns) if (!(column in (rows[0] ?? {}))) throw new Error(`merged_gw.csv is missing ${column}.`);
for (const column of requiredFixtureColumns) if (!(column in (fixtureRows[0] ?? {}))) throw new Error(`fixtures.csv is missing ${column}.`);

const playerById = new Map();
const teamCodeById = new Map();
const playerCodeOwners = new Map();
for (const row of playerRows) {
  const id = positiveInteger(row.id, "player id");
  const code = positiveInteger(row.code, "player code");
  const teamId = positiveInteger(row.team, "player team id");
  const teamCode = positiveInteger(row.team_code, "player team code");
  const existingCode = teamCodeById.get(teamId);
  if (existingCode != null && existingCode !== teamCode) throw new Error(`Ambiguous team code for season team ${teamId}.`);
  const existingOwner = playerCodeOwners.get(code);
  if (existingOwner != null && existingOwner !== id) throw new Error(`Ambiguous player code ${code}.`);
  teamCodeById.set(teamId, teamCode);
  playerCodeOwners.set(code, id);
  playerById.set(id, { code, position: { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" }[Number(row.element_type)] });
}

const fixtureById = new Map(fixtureRows.map((row) => {
  const id = positiveInteger(row.id, "fixture id");
  return [id, {
    teamH: positiveInteger(row.team_h, "fixture home team"),
    teamA: positiveInteger(row.team_a, "fixture away team"),
    teamHDifficulty: nullableNumber(row.team_h_difficulty),
    teamADifficulty: nullableNumber(row.team_a_difficulty),
  }];
}));

const sourceBase = {
  source: "vaastav-historical",
  season,
  asOf: manifest.commitTimestamp,
  confidence: "high",
  availability: "available",
};

const performances = rows.filter((row) => ["GK", "DEF", "MID", "FWD"].includes(row.position)).map((row) => {
  const sourcePlayerId = positiveInteger(row.element, "gameweek player id");
  const fixtureId = positiveInteger(row.fixture, "gameweek fixture id");
  const gameweek = positiveInteger(row.round, "gameweek round");
  const player = playerById.get(sourcePlayerId);
  const fixture = fixtureById.get(fixtureId);
  if (!player?.code || !player.position) throw new Error(`Missing stable identity for season player ${sourcePlayerId}.`);
  if (!fixture) throw new Error(`Missing fixture metadata for fixture ${fixtureId}.`);
  const wasHome = row.was_home === "True" || row.was_home === "true" || row.was_home === "1";
  const sourceTeamId = wasHome ? fixture.teamH : fixture.teamA;
  const sourceOpponentTeamId = wasHome ? fixture.teamA : fixture.teamH;
  const teamCode = teamCodeById.get(sourceTeamId);
  const opponentTeamCode = teamCodeById.get(sourceOpponentTeamId);
  if (!teamCode || !opponentTeamCode) throw new Error(`Missing stable team identity for fixture ${fixtureId}.`);
  return {
    source: { ...sourceBase, gameweek, fixtureId },
    sourcePlayerId,
    playerCode: player.code,
    playerName: row.name || null,
    position: row.position || player.position,
    sourceTeamId,
    teamCode,
    sourceOpponentTeamId,
    opponentTeamCode,
    wasHome,
    minutes: number(row.minutes),
    starts: number(row.starts),
    totalPoints: number(row.total_points),
    goals: number(row.goals_scored),
    assists: number(row.assists),
    expectedGoals: nullableNumber(row.expected_goals),
    expectedAssists: nullableNumber(row.expected_assists),
    value: nullableNumber(row.value),
    selected: nullableNumber(row.selected),
    fixtureDifficulty: wasHome ? fixture.teamHDifficulty : fixture.teamADifficulty,
  };
}).sort((left, right) => left.source.gameweek - right.source.gameweek || left.source.fixtureId - right.source.fixtureId || left.playerCode - right.playerCode);

const byPlayer = new Map();
const byOpponent = new Map();
for (const record of performances) {
  const playerRecords = byPlayer.get(record.playerCode) ?? [];
  playerRecords.push(record);
  byPlayer.set(record.playerCode, playerRecords);
  const key = `${record.playerCode}:${record.opponentTeamCode}`;
  const opponentRecords = byOpponent.get(key) ?? [];
  opponentRecords.push(record);
  byOpponent.set(key, opponentRecords);
}

const seasonAggregates = [...byPlayer.entries()].map(([playerCode, records]) => {
  const minutes = records.reduce((sum, record) => sum + record.minutes, 0);
  const totalPoints = records.reduce((sum, record) => sum + record.totalPoints, 0);
  return {
    source: { ...sourceBase, gameweek: null, fixtureId: null },
    playerCode,
    playerName: records.find((record) => record.playerName)?.playerName ?? null,
    season,
    matches: records.length,
    starts: records.reduce((sum, record) => sum + record.starts, 0),
    minutes,
    totalPoints,
    goals: records.reduce((sum, record) => sum + record.goals, 0),
    assists: records.reduce((sum, record) => sum + record.assists, 0),
    pointsPer90: minutes ? totalPoints / minutes * 90 : 0,
    homeMatches: records.filter((record) => record.wasHome).length,
    awayMatches: records.filter((record) => !record.wasHome).length,
  };
}).sort((left, right) => left.playerCode - right.playerCode);
const baselineByPlayer = new Map(seasonAggregates.map((aggregate) => [aggregate.playerCode, aggregate.pointsPer90]));

const opponentAggregates = [...byOpponent.entries()].map(([key, records]) => {
  const [playerCodeText, opponentTeamCodeText] = key.split(":");
  const playerCode = Number(playerCodeText);
  const opponentTeamCode = Number(opponentTeamCodeText);
  const minutes = records.reduce((sum, record) => sum + record.minutes, 0);
  const totalPoints = records.reduce((sum, record) => sum + record.totalPoints, 0);
  const pointsPer90 = minutes ? totalPoints / minutes * 90 : 0;
  const sampleSize = records.length;
  const shrinkWeight = sampleSize / (sampleSize + 4);
  return {
    source: { ...sourceBase, gameweek: null, fixtureId: null },
    playerCode,
    playerName: records.find((record) => record.playerName)?.playerName ?? null,
    opponentTeamCode,
    matches: sampleSize,
    starts: records.reduce((sum, record) => sum + record.starts, 0),
    minutes,
    totalPoints,
    pointsPer90,
    shrunkPointsPer90: pointsPer90 * shrinkWeight + (baselineByPlayer.get(playerCode) ?? 0) * (1 - shrinkWeight),
    homeMatches: records.filter((record) => record.wasHome).length,
    awayMatches: records.filter((record) => !record.wasHome).length,
    sampleSize,
    dataStatus: "available",
  };
}).sort((left, right) => left.playerCode - right.playerCode || left.opponentTeamCode - right.opponentTeamCode);

const source = {
  repository: manifest.repository,
  commitSha: manifest.commitSha,
  commitTimestamp: manifest.commitTimestamp,
  files: Object.fromEntries(Object.entries(inputs).map(([key, url]) => [key, { url, sha256: sha256(downloaded[key]) }])),
};
const runtimePayload = { schemaVersion: 2, season, source, recordCount: performances.length, seasonAggregates, opponentAggregates };
const trainingPayload = { schemaVersion: 2, season, source, performances };
const runtimeDirectory = join(root, "data", "historical");
const trainingDirectory = join(root, "data", "backtest");
await Promise.all([mkdir(runtimeDirectory, { recursive: true }), mkdir(trainingDirectory, { recursive: true })]);
await Promise.all([
  writeGzipAtomically(join(runtimeDirectory, `${season}.json.gz`), runtimePayload),
  writeGzipAtomically(join(trainingDirectory, `${season}.json.gz`), trainingPayload),
]);
console.log(`Imported ${performances.length} stable-identity records for ${season} from ${manifest.commitSha}.`);
