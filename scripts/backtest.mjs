import { readFile } from "node:fs/promises";
import { join } from "node:path";

const season = process.argv[process.argv.indexOf("--season") + 1] || "2024-25";
const file = join(process.cwd(), "data", "historical", `${season}.json`);
const dataset = JSON.parse(await readFile(file, "utf8"));
const records = dataset.performances || [];
const rounds = [...new Set(records.map((record) => record.source.gameweek).filter(Number.isFinite))].sort((a, b) => a - b);

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function rank(values) {
  const ordered = [...values].sort((left, right) => right.value - left.value);
  const ranks = new Map(ordered.map((item, index) => [item.key, index + 1]));
  return values.map((item) => ranks.get(item.key) || 0);
}

function correlation(left, right) {
  if (left.length < 2 || left.length !== right.length) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const leftSpread = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0));
  const rightSpread = Math.sqrt(right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return leftSpread && rightSpread ? numerator / leftSpread / rightSpread : null;
}

const errors = [];
const projectedRanks = [];
const actualRanks = [];
const captainHits = [];
const startBuckets = new Map();
const positionErrors = new Map();
const doubleGameweekErrors = [];
for (const round of rounds) {
  const prior = records.filter((record) => record.source.gameweek < round);
  const current = records.filter((record) => record.source.gameweek === round);
  const priorByPlayer = new Map();
  for (const record of prior) {
    const history = priorByPlayer.get(record.playerId) || [];
    history.push(record);
    priorByPlayer.set(record.playerId, history);
  }
  const outcomes = new Map();
  for (const record of current) {
    const outcome = outcomes.get(record.playerId) || { points: 0, starts: 0, fixtures: 0, position: record.position || "unknown" };
    outcome.points += Number(record.totalPoints) || 0;
    outcome.starts += Number(record.starts) || 0;
    outcome.fixtures += 1;
    outcomes.set(record.playerId, outcome);
  }
  const rows = [...outcomes.entries()].map(([playerId, outcome]) => {
    const history = (priorByPlayer.get(playerId) || []).slice(-5);
    return { playerId, outcome, projection: mean(history.map((record) => Number(record.totalPoints) || 0)) || 0, startEstimate: history.length ? mean(history.map((record) => Number(record.starts) > 0 ? 100 : 0)) : 0 };
  });
  if (!rows.length) continue;
  errors.push(...rows.map((row) => Math.abs(row.projection - row.outcome.points)));
  projectedRanks.push(...rank(rows.map((row) => ({ key: row.playerId, value: row.projection }))));
  actualRanks.push(...rank(rows.map((row) => ({ key: row.playerId, value: row.outcome.points }))));
  const captain = [...rows].sort((left, right) => right.projection - left.projection)[0];
  const actualBest = [...rows].sort((left, right) => right.outcome.points - left.outcome.points)[0];
  captainHits.push(captain?.playerId === actualBest?.playerId ? 1 : 0);
  for (const row of rows) {
    const bucket = Math.min(90, Math.floor(row.startEstimate / 10) * 10);
    const item = startBuckets.get(bucket) || { predicted: [], started: [] };
    item.predicted.push(row.startEstimate);
    item.started.push(row.outcome.starts > 0 ? 1 : 0);
    startBuckets.set(bucket, item);
    const position = row.outcome.position;
    const positionItem = positionErrors.get(position) || [];
    positionItem.push(Math.abs(row.projection - row.outcome.points));
    positionErrors.set(position, positionItem);
    if (row.outcome.fixtures > 1) doubleGameweekErrors.push(Math.abs(row.projection - row.outcome.points));
  }
}

console.log(JSON.stringify({
  season,
  records: records.length,
  gameweeks: rounds.length,
  meanAbsoluteProjectionError: mean(errors),
  rankCorrelation: correlation(projectedRanks, actualRanks),
  captainRecommendationHitRate: mean(captainHits),
  startingEstimateCalibration: [...startBuckets.entries()].map(([bucket, values]) => ({ bucket, averageEstimate: mean(values.predicted), observedStartRate: mean(values.started), sample: values.started.length })),
  performanceByPosition: Object.fromEntries([...positionErrors.entries()].map(([position, values]) => [position, { meanAbsoluteProjectionError: mean(values), sample: values.length }])),
  doubleGameweekMeanAbsoluteProjectionError: mean(doubleGameweekErrors),
  recentFormBaseline: "last five historical match points; reported as the projection used by this walk-forward path",
  fplEpNextComparison: "unavailable in Vaastav match snapshots; ep_next is excluded to avoid post-match leakage",
}, null, 2));
