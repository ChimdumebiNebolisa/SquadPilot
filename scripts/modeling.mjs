import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import {
  BASE_FIVE_PLUS_FEATURES,
  buildFivePlusReplayFeatures,
  buildModelFeatures,
  FIVE_PLUS_FEATURES,
  HISTORICAL_FIVE_PLUS_FEATURES,
  MODEL_FEATURES,
  PLAYER_HISTORY_FIVE_PLUS_FEATURES,
} from "../lib/scoring/model-features.ts";
import { predictWithModelArtifact } from "../lib/scoring/model-runtime.ts";

const gunzipAsync = promisify(gunzip);

export {
  BASE_FIVE_PLUS_FEATURES,
  FIVE_PLUS_FEATURES,
  HISTORICAL_FIVE_PLUS_FEATURES,
  MODEL_FEATURES,
  PLAYER_HISTORY_FIVE_PLUS_FEATURES,
};

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

function previousSeasonContext(records) {
  const byPlayer = new Map();
  const byOpponent = new Map();
  for (const record of records) {
    const playerRecords = byPlayer.get(record.playerCode) ?? [];
    playerRecords.push(record);
    byPlayer.set(record.playerCode, playerRecords);
    const key = `${record.playerCode}:${record.opponentTeamCode}`;
    const opponentRecords = byOpponent.get(key) ?? [];
    opponentRecords.push(record);
    byOpponent.set(key, opponentRecords);
  }
  const seasonByPlayerCode = new Map([...byPlayer.entries()].map(([playerCode, playerRecords]) => {
    const minutes = playerRecords.reduce((sum, record) => sum + (Number(record.minutes) || 0), 0);
    const totalPoints = playerRecords.reduce((sum, record) => sum + (Number(record.totalPoints) || 0), 0);
    return [playerCode, {
      matches: playerRecords.length,
      minutes,
      totalPoints,
      pointsPer90: minutes > 0 ? totalPoints / minutes * 90 : 0,
    }];
  }));
  const opponentByPlayerAndTeamCode = new Map([...byOpponent.entries()].map(([key, opponentRecords]) => {
    const playerCode = Number(key.split(":")[0]);
    const minutes = opponentRecords.reduce((sum, record) => sum + (Number(record.minutes) || 0), 0);
    const totalPoints = opponentRecords.reduce((sum, record) => sum + (Number(record.totalPoints) || 0), 0);
    const pointsPer90 = minutes > 0 ? totalPoints / minutes * 90 : 0;
    const sampleSize = opponentRecords.length;
    const shrinkWeight = sampleSize / (sampleSize + 4);
    const baseline = seasonByPlayerCode.get(playerCode)?.pointsPer90 ?? 0;
    return [key, {
      sampleSize,
      shrunkPointsPer90: pointsPer90 * shrinkWeight + baseline * (1 - shrinkWeight),
    }];
  }));
  return { seasonByPlayerCode, opponentByPlayerAndTeamCode };
}

function playerFeatures(history, currentRecords, completedTeamFixtures, priorSeason) {
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
  const previousSeason = priorSeason.seasonByPlayerCode.get(currentRecords[0]?.playerCode) ?? null;
  const previousOpponentHistory = currentRecords.flatMap((record) => {
    const value = priorSeason.opponentByPlayerAndTeamCode.get(`${record.playerCode}:${record.opponentTeamCode}`);
    return value ? [value] : [];
  });

  return {
    points: buildModelFeatures({
      recentPointsPerMatch: recentPoints,
      pointsPerGame,
      expectedMinutesFraction: priorMinutes / Math.max(1, history.length) / 90,
      averageFixtureDifficulty: averageDifficulty,
      homeFixtureFraction: homeFraction,
      price,
      historicalOpponentRatio: baselinePer90 > 0
        ? opponentPer90 / (baselinePer90 * 1.2)
        : 0.5,
    }),
    fivePlus: buildFivePlusReplayFeatures({
      totalPoints: priorPoints,
      minutes: priorMinutes,
      completedTeamFixtures,
      averageFixtureDifficulty: averageDifficulty,
      homeFixtureFraction: homeFraction,
      price,
      fixtureCount: currentRecords.length,
      previousSeason,
      opponentHistory: previousOpponentHistory,
    }),
  };
}

export function buildWalkForwardSamples(records, previousSeasonRecords = []) {
  const historyByPlayer = new Map();
  const completedFixturesByTeam = new Map();
  const priorSeason = previousSeasonContext(previousSeasonRecords);
  const samples = [];

  for (const [gameweek, roundRecords] of groupByRound(records)) {
    for (const current of aggregateCurrentRound(roundRecords)) {
      const history = historyByPlayer.get(current.playerCode) ?? [];
      if (history.length === 0 || !POSITIONS.includes(current.position)) continue;
      const teamCode = current.records[0]?.teamCode;
      const completedTeamFixtures = completedFixturesByTeam.get(teamCode)?.size ?? 0;
      const featureSets = playerFeatures(history, current.records, completedTeamFixtures, priorSeason);
      const fixtureCount = current.records.length;
      samples.push({
        season: current.records[0].source.season,
        gameweek,
        playerCode: current.playerCode,
        playerName: current.playerName,
        position: current.position,
        features: featureSets.points,
        fivePlusFeatures: featureSets.fivePlus,
        fixtureCount,
        target: current.totalPoints,
        targetPerFixture: current.totalPoints / fixtureCount,
        fivePlus: current.totalPoints >= 5 ? 1 : 0,
        recentFormBaseline: featureSets.points.recentForm * 10 * fixtureCount,
      });
    }

    for (const record of roundRecords) {
      const history = historyByPlayer.get(record.playerCode) ?? [];
      history.push(record);
      historyByPlayer.set(record.playerCode, history);
      const fixtures = completedFixturesByTeam.get(record.teamCode) ?? new Set();
      fixtures.add(record.source.fixtureId);
      completedFixturesByTeam.set(record.teamCode, fixtures);
    }
  }

  return samples;
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function fitLogistic(
  samples,
  fivePlusFeatures = FIVE_PLUS_FEATURES,
  { lambda = 2, penaltyMultipliers = {} } = {},
) {
  const rows = samples.map((sample) => [1, ...fivePlusFeatures.map((feature) => sample.fivePlusFeatures[feature])]);
  const size = fivePlusFeatures.length + 1;
  const weights = Array(size).fill(0);
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const matrix = Array.from({ length: size }, () => Array(size).fill(0));
    const values = Array(size).fill(0);
    for (let row = 0; row < rows.length; row += 1) {
      const probability = clamp(sigmoid(rows[row].reduce((sum, value, index) => sum + value * weights[index], 0)), 1e-6, 1 - 1e-6);
      const variance = probability * (1 - probability);
      for (let left = 0; left < size; left += 1) {
        values[left] += rows[row][left] * (samples[row].fivePlus - probability);
        for (let right = 0; right < size; right += 1) {
          matrix[left][right] += rows[row][left] * rows[row][right] * variance;
        }
      }
    }
    for (let index = 1; index < size; index += 1) {
      matrix[index][index] += lambda * (penaltyMultipliers[fivePlusFeatures[index - 1]] ?? 1);
      values[index] -= lambda * weights[index];
    }
    const update = solveLinearSystem(matrix, values);
    for (let index = 0; index < size; index += 1) weights[index] += update[index];
    if (Math.max(...update.map(Math.abs)) < 1e-8) break;
  }
  return {
    intercept: weights[0],
    coefficients: Object.fromEntries(fivePlusFeatures.map((feature, index) => [feature, weights[index + 1]])),
  };
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

export function rawFivePlusProbability(model, features, fivePlusFeatures = FIVE_PLUS_FEATURES) {
  return sigmoid(
    model.intercept + fivePlusFeatures.reduce(
      (sum, feature) => sum + model.coefficients[feature] * features[feature],
      0,
    ),
  );
}

function fitIsotonic(pairs, maximumBins = 60, minimumBinSize = 25) {
  const sorted = [...pairs].sort((left, right) => left.x - right.x);
  const binCount = Math.max(1, Math.min(maximumBins, Math.floor(sorted.length / minimumBinSize)));
  const binSize = Math.max(1, Math.ceil(sorted.length / binCount));
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

export function trainModels(samples, fivePlusFeatures = FIVE_PLUS_FEATURES, logisticOptions = {}) {
  return Object.fromEntries(POSITIONS.map((position) => {
    const positionSamples = samples.filter((sample) => sample.position === position);
    const model = fitRidge(positionSamples);
    const storedModel = {
      intercept: round(model.intercept),
      coefficients: Object.fromEntries(Object.entries(model.coefficients).map(([key, value]) => [key, round(value)])),
    };
    const scored = positionSamples.map((sample) => ({
      sample,
      perFixture: rawPrediction(storedModel, sample.features),
    }));
    const probabilityModel = fitLogistic(positionSamples, fivePlusFeatures, logisticOptions);
    const storedProbabilityModel = {
      intercept: round(probabilityModel.intercept),
      coefficients: Object.fromEntries(Object.entries(probabilityModel.coefficients).map(([key, value]) => [key, round(value)])),
    };
    const singleGameweekProbabilities = positionSamples
      .filter((sample) => sample.fixtureCount === 1)
      .map((sample) => ({
        x: rawFivePlusProbability(storedProbabilityModel, sample.fivePlusFeatures, fivePlusFeatures),
        y: sample.fivePlus,
      }));
    return [position, {
      ...storedModel,
      pointsCalibration: fitIsotonic(scored.map(({ sample, perFixture }) => ({ x: perFixture, y: sample.targetPerFixture }))),
      recentFormBlend: 0.9,
      fivePlus: {
        ...storedProbabilityModel,
        calibration: fitIsotonic(singleGameweekProbabilities),
      },
      sampleSize: positionSamples.length,
    }];
  }));
}

export function trainDoubleGameweekCalibration(models, samples, fivePlusFeatures = FIVE_PLUS_FEATURES) {
  return fitIsotonic(samples
    .filter((sample) => sample.fixtureCount > 1)
    .map((sample) => ({
      x: rawFivePlusProbability(models[sample.position].fivePlus, sample.fivePlusFeatures, fivePlusFeatures),
      y: sample.fivePlus,
    })));
}

export function predictSample(models, sample, doubleGameweekFivePlusCalibration = [], fivePlusFeatures = FIVE_PLUS_FEATURES) {
  const prediction = predictWithModelArtifact(
    { features: MODEL_FEATURES, fivePlusFeatures, models, doubleGameweekFivePlusCalibration },
    sample.position,
    sample.features,
    sample.fivePlusFeatures,
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

function rocAuc(rows) {
  const positives = rows.filter((row) => row.sample.fivePlus === 1).length;
  const negatives = rows.length - positives;
  if (positives === 0 || negatives === 0) return 0.5;
  const ranked = rows
    .map((row, index) => ({ probability: row.probability, positive: row.sample.fivePlus === 1, index }))
    .sort((left, right) => left.probability - right.probability || left.index - right.index);
  let positiveRankSum = 0;
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && ranked[end].probability === ranked[start].probability) end += 1;
    const averageRank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) {
      if (ranked[index].positive) positiveRankSum += averageRank;
    }
    start = end;
  }
  return (positiveRankSum - positives * (positives + 1) / 2) / (positives * negatives);
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

export function evaluateModels(models, samples, doubleGameweekFivePlusCalibration = [], fivePlusFeatures = FIVE_PLUS_FEATURES) {
  const rows = samples.map((sample) => {
    const prediction = predictSample(models, sample, doubleGameweekFivePlusCalibration, fivePlusFeatures);
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
  const probabilitySlice = (subset) => {
    const observedRate = mean(subset.map((row) => row.sample.fivePlus));
    const meanProbability = mean(subset.map((row) => row.probability));
    const brierDifferencesByRound = new Map();
    for (const row of subset) {
      const key = `${row.sample.season}:${row.sample.gameweek}`;
      const values = brierDifferencesByRound.get(key) ?? [];
      values.push((row.probability - row.sample.fivePlus) ** 2 - (observedRate - row.sample.fivePlus) ** 2);
      brierDifferencesByRound.set(key, values);
    }
    const roundDifferences = [...brierDifferencesByRound.values()].map(mean);
    const meanRoundDifference = mean(roundDifferences);
    const roundDifferenceVariance = roundDifferences.length > 1
      ? roundDifferences.reduce((sum, value) => sum + (value - meanRoundDifference) ** 2, 0) / (roundDifferences.length - 1)
      : 0;
    const confidenceRadius = 1.96 * Math.sqrt(roundDifferenceVariance / Math.max(1, roundDifferences.length));
    return {
      samples: subset.length,
      brierScore: mean(subset.map((row) => (row.probability - row.sample.fivePlus) ** 2)),
      baseRateBrierScore: mean(subset.map((row) => (observedRate - row.sample.fivePlus) ** 2)),
      expectedCalibrationError: expectedCalibrationError(subset),
      rocAuc: rocAuc(subset),
      meanProbability,
      observedRate,
      bias: meanProbability - observedRate,
      gameweekClusteredBrierDifference: {
        gameweeks: roundDifferences.length,
        mean: meanRoundDifference,
        lower95: meanRoundDifference - confidenceRadius,
        upper95: meanRoundDifference + confidenceRadius,
      },
    };
  };
  const result = {
    samples: rows.length,
    meanAbsoluteError: mean(rows.map((row) => row.error)),
    recentFormBaselineMeanAbsoluteError: mean(rows.map((row) => row.baselineError)),
    rankCorrelation: rankCorrelationByRound(rows, "projection"),
    recentFormBaselineRankCorrelation: rankCorrelationByRound(rows.map((row) => ({ ...row, baseline: row.sample.recentFormBaseline })), "baseline"),
    brierScore: brier,
    baseRateBrierScore: baseRateBrier,
    expectedCalibrationError: expectedCalibrationError(rows),
    rocAuc: rocAuc(rows),
    captainHitRate: captainHitRate(rows),
    byPosition: Object.fromEntries(POSITIONS.map((position) => {
      const subset = rows.filter((row) => row.sample.position === position);
      return [position, {
        ...probabilitySlice(subset),
        meanAbsoluteError: mean(subset.map((row) => row.error)),
        rankCorrelation: rankCorrelationByRound(subset, "projection"),
        recentFormBaselineRankCorrelation: rankCorrelationByRound(
          subset.map((row) => ({ ...row, baseline: row.sample.recentFormBaseline })),
          "baseline",
        ),
      }];
    })),
    activeCandidates: (() => {
      const subset = rows.filter((row) => row.sample.fivePlusFeatures.minutesPerTeamFixture >= 2 / 3);
      return probabilitySlice(subset);
    })(),
    doubleGameweeks: (() => {
      const subset = rows.filter((row) => row.sample.fixtureCount > 1);
      return { ...probabilitySlice(subset), meanAbsoluteError: mean(subset.map((row) => row.error)) };
    })(),
    singleGameweeks: (() => {
      const subset = rows.filter((row) => row.sample.fixtureCount === 1);
      return { ...probabilitySlice(subset), meanAbsoluteError: mean(subset.map((row) => row.error)) };
    })(),
  };
  result.releaseGates = {
    maeBeatsRecentForm: result.meanAbsoluteError < result.recentFormBaselineMeanAbsoluteError,
    rankBeatsRecentForm: result.rankCorrelation > result.recentFormBaselineRankCorrelation,
    brierBeatsBaseRate: result.brierScore < result.baseRateBrierScore,
    calibrationWithinLimit: result.expectedCalibrationError <= 0.08,
    clusteredBrierImprovementLikely: probabilitySlice(rows).gameweekClusteredBrierDifference.upper95 < 0,
    everyPositionBrierBeatsBaseRate: Object.values(result.byPosition)
      .every((position) => position.brierScore < position.baseRateBrierScore),
    everyPositionCalibrationWithinLimit: Object.values(result.byPosition)
      .every((position) => position.expectedCalibrationError <= 0.08),
    everyPositionClusteredBrierImprovementLikely: Object.values(result.byPosition)
      .every((position) => position.gameweekClusteredBrierDifference.upper95 < 0),
    activeCandidateBrierBeatsBaseRate: result.activeCandidates.brierScore < result.activeCandidates.baseRateBrierScore,
    activeCandidateCalibrationWithinLimit: result.activeCandidates.expectedCalibrationError <= 0.08,
    activeCandidateClusteredBrierImprovementLikely:
      result.activeCandidates.gameweekClusteredBrierDifference.upper95 < 0,
    doubleGameweekBrierBeatsBaseRate: result.doubleGameweeks.samples === 0
      || result.doubleGameweeks.brierScore < result.doubleGameweeks.baseRateBrierScore,
    doubleGameweekCalibrationWithinLimit: result.doubleGameweeks.samples === 0
      || result.doubleGameweeks.expectedCalibrationError <= 0.08,
    doubleGameweekBiasWithinLimit: result.doubleGameweeks.samples === 0
      || Math.abs(result.doubleGameweeks.bias) <= 0.05,
  };
  result.releasePassed = Object.values(result.releaseGates).every(Boolean);
  return result;
}

function predictionRows(specification, samples) {
  return samples.map((sample) => ({
    sample,
    probability: predictSample(
      specification.models,
      sample,
      specification.doubleGameweekFivePlusCalibration,
      specification.fivePlusFeatures,
    ).fivePlusProbability,
  }));
}

function pairedProbabilitySlice(candidateRows, incumbentRows) {
  const differencesByRound = new Map();
  const candidateBrier = [];
  const incumbentBrier = [];
  for (let index = 0; index < candidateRows.length; index += 1) {
    const candidate = candidateRows[index];
    const incumbent = incumbentRows[index];
    const candidateError = (candidate.probability - candidate.sample.fivePlus) ** 2;
    const incumbentError = (incumbent.probability - incumbent.sample.fivePlus) ** 2;
    candidateBrier.push(candidateError);
    incumbentBrier.push(incumbentError);
    const key = `${candidate.sample.season}:${candidate.sample.gameweek}`;
    const values = differencesByRound.get(key) ?? [];
    values.push(candidateError - incumbentError);
    differencesByRound.set(key, values);
  }
  const roundDifferences = [...differencesByRound.values()].map(mean);
  const meanDifference = mean(roundDifferences);
  const variance = roundDifferences.length > 1
    ? roundDifferences.reduce((sum, value) => sum + (value - meanDifference) ** 2, 0) / (roundDifferences.length - 1)
    : 0;
  const radius = 1.96 * Math.sqrt(variance / Math.max(1, roundDifferences.length));
  return {
    samples: candidateRows.length,
    candidateBrierScore: mean(candidateBrier),
    incumbentBrierScore: mean(incumbentBrier),
    brierDifference: mean(candidateBrier) - mean(incumbentBrier),
    candidateRocAuc: rocAuc(candidateRows),
    incumbentRocAuc: rocAuc(incumbentRows),
    gameweekClusteredBrierDifference: {
      gameweeks: roundDifferences.length,
      mean: meanDifference,
      lower95: meanDifference - radius,
      upper95: meanDifference + radius,
    },
  };
}

export function compareProbabilityModels(candidate, incumbent, samples) {
  const candidateRows = predictionRows(candidate, samples);
  const incumbentRows = predictionRows(incumbent, samples);
  const indices = (predicate) => samples.flatMap((sample, index) => predicate(sample) ? [index] : []);
  const slice = (selected) => pairedProbabilitySlice(
    selected.map((index) => candidateRows[index]),
    selected.map((index) => incumbentRows[index]),
  );
  const overall = slice(indices(() => true));
  const activeCandidates = slice(indices((sample) => sample.fivePlusFeatures.minutesPerTeamFixture >= 2 / 3));
  const byPosition = Object.fromEntries(POSITIONS.map((position) => [
    position,
    slice(indices((sample) => sample.position === position)),
  ]));
  const gates = {
    overallBrierImproves: overall.candidateBrierScore < overall.incumbentBrierScore,
    activeCandidateBrierImproves:
      activeCandidates.candidateBrierScore < activeCandidates.incumbentBrierScore,
    everyPositionBrierWithinTolerance: Object.values(byPosition)
      .every((position) => position.brierDifference <= 0.002),
    overallDiscriminationDoesNotRegress: overall.candidateRocAuc >= overall.incumbentRocAuc,
    activeCandidateDiscriminationDoesNotRegress:
      activeCandidates.candidateRocAuc >= activeCandidates.incumbentRocAuc,
    pairedGameweekBrierDifferenceIsNegative:
      overall.gameweekClusteredBrierDifference.mean < 0,
  };
  return { overall, activeCandidates, byPosition, gates, passed: Object.values(gates).every(Boolean) };
}

export function probabilityDiagnostics(specification, samples) {
  const probabilities = predictionRows(specification, samples)
    .map((row) => row.probability)
    .sort((left, right) => left - right);
  const percentile = (fraction) => probabilities[Math.floor((probabilities.length - 1) * fraction)] ?? 0;
  return {
    distribution: {
      minimum: probabilities[0] ?? 0,
      p10: percentile(0.1),
      p25: percentile(0.25),
      median: percentile(0.5),
      p75: percentile(0.75),
      p90: percentile(0.9),
      maximum: probabilities.at(-1) ?? 0,
    },
    calibrationCaps: Object.fromEntries(POSITIONS.map((position) => {
      const last = specification.models[position].fivePlus.calibration.at(-1);
      return [position, last ? { rawThreshold: last.threshold, calibratedProbability: last.value } : null];
    })),
    historyCoverage: {
      previousSeason: mean(samples.map((sample) => sample.fivePlusFeatures.previousSeasonAvailable)),
      opponent: mean(samples.map((sample) => sample.fivePlusFeatures.opponentHistoryCoverage)),
    },
  };
}
