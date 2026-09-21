import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { buildModelFeatures, MODEL_FEATURES } from "../lib/scoring/model-features.ts";
import { predictWithModelArtifact } from "../lib/scoring/model-runtime.ts";

const gunzipAsync = promisify(gunzip);

export { MODEL_FEATURES };

export const POSITIONS = ["GK", "DEF", "MID", "FWD"];

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value, places = 6) {
  return Number(value.toFixed(places));
}

export async function loadTrainingSeason(season) {
  const file = join(process.cwd(), "data", "backtest", `${season}.json.gz`);
  const snapshot = JSON.parse((await gunzipAsync(await readFile(file))).toString("utf8"));
  if (snapshot.schemaVersion !== 2 || !Array.isArray(snapshot.performances)) {
    throw new Error(`Backtest snapshot ${season} does not use historical schema v2.`);
  }
  return snapshot;
}

function groupByRound(records) {
  const rounds = new Map();
  for (const record of records) {
    const round = record.source?.gameweek;
    if (!Number.isInteger(round) || round <= 0) continue;
    const current = rounds.get(round) ?? [];
    current.push(record);
    rounds.set(round, current);
  }
  return [...rounds.entries()].sort(([left], [right]) => left - right);
}

function aggregateCurrentRound(records) {
  const players = new Map();
  for (const record of records) {
    const current = players.get(record.playerCode) ?? {
      playerCode: record.playerCode,
      playerName: record.playerName,
      position: record.position,
      records: [],
      totalPoints: 0,
    };
    current.records.push(record);
    current.totalPoints += Number(record.totalPoints) || 0;
    players.set(record.playerCode, current);
  }
  return [...players.values()];
}

function playerFeatures(history, currentRecords) {
  const recent = history.slice(-5);
  const priorPoints = history.reduce((sum, record) => sum + (Number(record.totalPoints) || 0), 0);
  const priorMinutes = history.reduce((sum, record) => sum + (Number(record.minutes) || 0), 0);
  const recentPoints = mean(recent.map((record) => Number(record.totalPoints) || 0));
  const pointsPerGame = priorPoints / Math.max(1, history.length);
  const price = Number(currentRecords[0]?.value) / 10;
  const averageDifficulty = mean(currentRecords.map((record) => Number(record.fixtureDifficulty) || 3));
  const homeFraction = mean(currentRecords.map((record) => record.wasHome ? 1 : 0));
  const opponents = new Set(currentRecords.map((record) => record.opponentTeamCode));
  const opponentHistory = history.filter((record) => opponents.has(record.opponentTeamCode));
  const opponentMinutes = opponentHistory.reduce((sum, record) => sum + (Number(record.minutes) || 0), 0);
  const opponentPoints = opponentHistory.reduce((sum, record) => sum + (Number(record.totalPoints) || 0), 0);
  const baselinePer90 = priorMinutes > 0 ? priorPoints / priorMinutes * 90 : pointsPerGame;
  const opponentPer90 = opponentMinutes > 0 ? opponentPoints / opponentMinutes * 90 : baselinePer90 * 0.6;

  return buildModelFeatures({
    recentPointsPerMatch: recentPoints,
    pointsPerGame,
    expectedMinutesFraction: priorMinutes / Math.max(1, history.length) / 90,
    averageFixtureDifficulty: averageDifficulty,
    homeFixtureFraction: homeFraction,
    price,
    historicalOpponentRatio: baselinePer90 > 0
      ? opponentPer90 / (baselinePer90 * 1.2)
      : 0.5,
  });
}

export function buildWalkForwardSamples(records) {
  const historyByPlayer = new Map();
  const samples = [];

  for (const [gameweek, roundRecords] of groupByRound(records)) {
    for (const current of aggregateCurrentRound(roundRecords)) {
      const history = historyByPlayer.get(current.playerCode) ?? [];
      if (history.length === 0 || !POSITIONS.includes(current.position)) continue;
      const features = playerFeatures(history, current.records);
      const fixtureCount = current.records.length;
      samples.push({
        season: current.records[0].source.season,
        gameweek,
        playerCode: current.playerCode,
        playerName: current.playerName,
        position: current.position,
        features,
        fixtureCount,
        target: current.totalPoints,
        targetPerFixture: current.totalPoints / fixtureCount,
        fivePlus: current.totalPoints >= 5 ? 1 : 0,
        recentFormBaseline: features.recentForm * 10 * fixtureCount,
      });
    }

    for (const record of roundRecords) {
      const history = historyByPlayer.get(record.playerCode) ?? [];
      history.push(record);
      historyByPlayer.set(record.playerCode, history);
    }
  }

  return samples;
}

function solveLinearSystem(matrix, values) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column] || 1e-12;
    for (let value = column; value <= size; value += 1) augmented[column][value] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let value = column; value <= size; value += 1) {
        augmented[row][value] -= factor * augmented[column][value];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function fitRidge(samples, lambda = 2) {
  const rows = samples.map((sample) => [1, ...MODEL_FEATURES.map((feature) => sample.features[feature])]);
  const targets = samples.map((sample) => sample.targetPerFixture);
  const size = MODEL_FEATURES.length + 1;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const values = Array(size).fill(0);
  for (let row = 0; row < rows.length; row += 1) {
    for (let left = 0; left < size; left += 1) {
      values[left] += rows[row][left] * targets[row];
      for (let right = 0; right < size; right += 1) {
        matrix[left][right] += rows[row][left] * rows[row][right];
      }
    }
  }
  for (let index = 1; index < size; index += 1) matrix[index][index] += lambda;
  const solved = solveLinearSystem(matrix, values);
  return {
    intercept: solved[0],
    coefficients: Object.fromEntries(MODEL_FEATURES.map((feature, index) => [feature, solved[index + 1]])),
  };
}

export function rawPrediction(model, features) {
  return clamp(
    model.intercept + MODEL_FEATURES.reduce((sum, feature) => sum + model.coefficients[feature] * features[feature], 0),
    0,
    15,
  );
}

function fitIsotonic(pairs, maximumBins = 60) {
  const sorted = [...pairs].sort((left, right) => left.x - right.x);
  const binSize = Math.max(1, Math.ceil(sorted.length / maximumBins));
  const blocks = [];
  for (let start = 0; start < sorted.length; start += binSize) {
    const bin = sorted.slice(start, start + binSize);
    blocks.push({
      minimum: bin[0].x,
      maximum: bin.at(-1).x,
      weight: bin.length,
      value: mean(bin.map((item) => item.y)),
    });
  }
  for (let index = 0; index < blocks.length - 1;) {
    if (blocks[index].value <= blocks[index + 1].value) {
      index += 1;
      continue;
    }
    const left = blocks[index];
    const right = blocks[index + 1];
    blocks.splice(index, 2, {
      minimum: left.minimum,
      maximum: right.maximum,
      weight: left.weight + right.weight,
      value: (left.value * left.weight + right.value * right.weight) / (left.weight + right.weight),
    });
    if (index > 0) index -= 1;
  }
  return blocks.map((block) => ({ threshold: round(block.maximum), value: round(block.value) }));
}

export function applyIsotonic(points, value) {
  if (!points.length) return value;
  if (value <= points[0].threshold) return points[0].value;
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (value > right.threshold) continue;
    const left = points[index - 1];
    if (right.threshold === left.threshold) return right.value;
    const progress = (value - left.threshold) / (right.threshold - left.threshold);
    return left.value + progress * (right.value - left.value);
  }
  return points.at(-1).value;
}

export function trainModels(samples) {
  return Object.fromEntries(POSITIONS.map((position) => {
    const positionSamples = samples.filter((sample) => sample.position === position);
    const model = fitRidge(positionSamples);
    const scored = positionSamples.map((sample) => ({
      sample,
      perFixture: rawPrediction(model, sample.features),
    }));
    return [position, {
      intercept: round(model.intercept),
      coefficients: Object.fromEntries(Object.entries(model.coefficients).map(([key, value]) => [key, round(value)])),
      pointsCalibration: fitIsotonic(scored.map(({ sample, perFixture }) => ({ x: perFixture, y: sample.targetPerFixture }))),
      fivePlusCalibration: fitIsotonic(scored.map(({ sample, perFixture }) => ({
        x: perFixture * sample.fixtureCount,
        y: sample.fivePlus,
      }))),
      recentFormBlend: 0.9,
      sampleSize: positionSamples.length,
    }];
  }));
}

export function predictSample(models, sample) {
  const prediction = predictWithModelArtifact(
    { features: MODEL_FEATURES, models },
    sample.position,
    sample.features,
    sample.fixtureCount,
  );
  return {
    projectedPoints: prediction.projectedPoints,
    fivePlusProbability: prediction.fivePlusProbability / 100,
  };
}

function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const result = Array(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end += 1;
    const rank = (start + end - 1) / 2 + 1;
    for (let index = start; index < end; index += 1) result[sorted[index].index] = rank;
    start = end;
  }
  return result;
}

function correlation(left, right) {
  if (left.length < 2 || left.length !== right.length) return 0;
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const leftSpread = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0));
  const rightSpread = Math.sqrt(right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return leftSpread && rightSpread ? numerator / leftSpread / rightSpread : 0;
}

function rankCorrelationByRound(rows, field) {
  const byRound = new Map();
  for (const row of rows) {
    const key = `${row.sample.season}:${row.sample.gameweek}`;
    const group = byRound.get(key) ?? [];
    group.push(row);
    byRound.set(key, group);
  }
  return mean([...byRound.values()].map((group) => correlation(
    ranks(group.map((row) => row[field])),
    ranks(group.map((row) => row.sample.target)),
  )));
}

function expectedCalibrationError(rows) {
  const buckets = Array.from({ length: 10 }, () => []);
  for (const row of rows) buckets[Math.min(9, Math.floor(row.probability * 10))].push(row);
  return buckets.reduce((sum, bucket) => {
    if (!bucket.length) return sum;
    const calibrationGap = Math.abs(mean(bucket.map((row) => row.probability)) - mean(bucket.map((row) => row.sample.fivePlus)));
    return sum + calibrationGap * bucket.length / rows.length;
  }, 0);
}

function captainHitRate(rows) {
  const byRound = new Map();
  for (const row of rows) {
    const key = `${row.sample.season}:${row.sample.gameweek}`;
    const group = byRound.get(key) ?? [];
    group.push(row);
    byRound.set(key, group);
  }
  return mean([...byRound.values()].map((group) => {
    const captain = [...group].sort((left, right) => right.projection - left.projection)[0];
    return captain.sample.target >= 5 ? 1 : 0;
  }));
}

export function evaluateModels(models, samples) {
  const rows = samples.map((sample) => {
    const prediction = predictSample(models, sample);
    return {
      sample,
      projection: prediction.projectedPoints,
      probability: prediction.fivePlusProbability,
      error: Math.abs(prediction.projectedPoints - sample.target),
      baselineError: Math.abs(sample.recentFormBaseline - sample.target),
    };
  });
  const baseRate = mean(rows.map((row) => row.sample.fivePlus));
  const brier = mean(rows.map((row) => (row.probability - row.sample.fivePlus) ** 2));
  const baseRateBrier = mean(rows.map((row) => (baseRate - row.sample.fivePlus) ** 2));
  const result = {
    samples: rows.length,
    meanAbsoluteError: mean(rows.map((row) => row.error)),
    recentFormBaselineMeanAbsoluteError: mean(rows.map((row) => row.baselineError)),
    rankCorrelation: rankCorrelationByRound(rows, "projection"),
    recentFormBaselineRankCorrelation: rankCorrelationByRound(rows.map((row) => ({ ...row, baseline: row.sample.recentFormBaseline })), "baseline"),
    brierScore: brier,
    baseRateBrierScore: baseRateBrier,
    expectedCalibrationError: expectedCalibrationError(rows),
    captainHitRate: captainHitRate(rows),
    byPosition: Object.fromEntries(POSITIONS.map((position) => {
      const subset = rows.filter((row) => row.sample.position === position);
      return [position, {
        samples: subset.length,
        meanAbsoluteError: mean(subset.map((row) => row.error)),
        rankCorrelation: rankCorrelationByRound(subset, "projection"),
        recentFormBaselineRankCorrelation: rankCorrelationByRound(
          subset.map((row) => ({ ...row, baseline: row.sample.recentFormBaseline })),
          "baseline",
        ),
      }];
    })),
    doubleGameweeks: (() => {
      const subset = rows.filter((row) => row.sample.fixtureCount > 1);
      return { samples: subset.length, meanAbsoluteError: mean(subset.map((row) => row.error)) };
    })(),
    singleGameweeks: (() => {
      const subset = rows.filter((row) => row.sample.fixtureCount === 1);
      return { samples: subset.length, meanAbsoluteError: mean(subset.map((row) => row.error)) };
    })(),
  };
  result.releaseGates = {
    maeBeatsRecentForm: result.meanAbsoluteError < result.recentFormBaselineMeanAbsoluteError,
    rankBeatsRecentForm: result.rankCorrelation > result.recentFormBaselineRankCorrelation,
    brierBeatsBaseRate: result.brierScore < result.baseRateBrierScore,
    calibrationWithinLimit: result.expectedCalibrationError <= 0.08,
  };
  result.releasePassed = Object.values(result.releaseGates).every(Boolean);
  return result;
}
