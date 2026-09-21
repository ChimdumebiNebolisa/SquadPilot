# Walk-forward training and validation

SquadPilot separates compact runtime aggregates under `data/historical/` from match-level training records under `data/backtest/`. Both are generated from the same pinned Vaastav commit and carry the source URLs and SHA-256 input hashes.

## Leakage boundary

For an evaluated gameweek, feature state is built only from that player's records in earlier gameweeks. The current gameweek contributes fixture count, venue, and difficulty but no post-match player fields. Vaastav's raw match file includes an `xP` field, but SquadPilot deliberately excludes it from the normalized training snapshot and all model inputs; live FPL `ep_next` remains comparator-only.

Projected points use seven normalized inputs: recent form, season points per game, expected minutes, fixture difficulty, home share, value, and stable-code opponent history. A regularized point model is trained separately for GK, DEF, MID, and FWD.

The 5+ statistic is a separate regularized classifier. Its six inputs are limited to fields that can be replayed with identical semantics from pre-gameweek records and live cumulative totals: season points per completed team fixture, minutes per completed team fixture, fixture difficulty, home share, value efficiency, and fixture count. Live form, FPL points-per-game, opponent history, injury chance, and status are not probability inputs. The same pure feature builder serves production and historical replay. Position-specific monotonic calibration is fitted on training-season single gameweeks; double gameweeks use a pooled calibration with a minimum of 25 training observations per initial bin.

The pinned Vaastav match files do not contain every deadline-time live FPL field, including injury chance and status. Those fields remain useful for the separate starting outlook and point projection, but are excluded from the calibrated 5+ classifier. The UI still calls the result a model estimate: held-out historical calibration does not guarantee future-season calibration.

## Reproduction

```bash
npm run verify:reimport
npm run train:model
npm run backtest
```

`verify:reimport` downloads the pinned inputs again and requires the resulting gzip files to be byte-identical. `train:model` trains on 2024-25, validates on 2025-26, writes `data/model/scoring-model.json`, and fails if a release gate is missed. `backtest` independently reads the artifact and recomputes the validation report.

## Release gates

The held-out report must satisfy all of the following:

- model MAE is lower than the recent-form baseline;
- mean gameweek Spearman rank correlation is higher than the baseline;
- Brier score for 5+ points is lower than the validation base-rate Brier score;
- expected calibration error is no greater than 0.08;
- every position beats its own base-rate Brier score and has expected calibration error no greater than 0.08;
- the high-minutes candidate cohort beats its own base-rate Brier score and has expected calibration error no greater than 0.08;
- the overall, every-position, and high-minutes paired Brier improvements have gameweek-clustered 95% intervals below zero;
- double-gameweek Brier score beats the double-gameweek base rate;
- double-gameweek expected calibration error is no greater than 0.08;
- double-gameweek absolute probability bias is no greater than 0.05.

The report also includes captain 5+ hit rate, position probability slices, and single-/double-gameweek MAE. DGW row-level quality remains gated, but its gameweek-clustered significance is diagnostic: only 11 held-out DGW gameweeks are available and the current interval overlaps zero. The UI labels that evidence as limited rather than implying SGW-level support.
