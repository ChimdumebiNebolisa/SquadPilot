# Walk-forward training and validation

SquadPilot separates compact runtime aggregates under `data/historical/` from match-level training records under `data/backtest/`. Both are generated from the same pinned Vaastav commit and carry the source URLs and SHA-256 input hashes.

## Leakage boundary

For an evaluated gameweek, current-season feature state is built only from that player's records in earlier gameweeks. The current gameweek contributes fixture count, venue, and difficulty but no post-match player fields. Previous-season features use only the immediately preceding completed season: 2023-24 for 2024-25 training, 2024-25 for 2025-26 validation, and 2025-26 in production. Vaastav's raw match file includes an `xP` field, but SquadPilot deliberately excludes it from the normalized training snapshot and all model inputs; live FPL `ep_next` remains comparator-only.

Projected points use seven normalized inputs: recent form, season points per game, expected minutes, fixture difficulty, home share, value, and stable-code opponent history. A regularized point model is trained separately for GK, DEF, MID, and FWD.

The 5+ statistic is a separate position-specific regularized classifier. Its current-season inputs are points and minutes per completed team fixture, fixture difficulty, home share, value efficiency, and fixture count. Stable-code history adds previous-season points per 90, points per fixture, minutes and sample reliability, an explicit availability indicator, a history-adjusted points rate, and opponent-specific shrunk points per 90, sample strength, and fixture coverage. Missing history remains explicit zero/coverage state; it is never replaced by a fabricated average. Historical coefficients receive strong regularization because unshrunk history improved training data while regressing the next-season holdout.

The same pure feature builder serves production and historical replay. Position-specific monotonic calibration is fitted on training-season single gameweeks; double gameweeks use a pooled calibration with a minimum of 25 training observations per initial bin. Probability is calculated for every player before optimization, so appearing in the recommended 15 cannot change it. Live injury chance and status remain separate because they cannot be replayed consistently from the pinned historical source.

The pinned Vaastav match files do not contain every deadline-time live FPL field, including injury chance and status. Those fields remain useful for the separate starting outlook and point projection, but are excluded from the calibrated 5+ classifier. The UI still calls the result a model estimate: held-out historical calibration does not guarantee future-season calibration.

## Reproduction

```bash
npm run verify:reimport
npm run train:model
npm run backtest
```

`verify:reimport` downloads all three pinned seasons again and requires the resulting gzip files to be byte-identical. `train:model` trains on 2024-25 with 2023-24 context, validates on 2025-26, and writes `data/model/scoring-model.json` only after every gate passes. `backtest` independently reconstructs the incumbent feature set and recomputes the validation and comparison reports.

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
- double-gameweek absolute probability bias is no greater than 0.05;
- overall and high-minutes Brier scores improve over the incumbent feature set;
- no position's Brier score regresses by more than 0.002;
- overall and high-minutes ROC AUC do not regress;
- the gameweek-clustered mean paired Brier difference against the incumbent is negative.

The report also includes captain 5+ hit rate, position probability slices, single-/double-gameweek MAE, calibration caps, history coverage, probability distribution, and incumbent/player-history/full-history ablations. The confidence interval around the incumbent comparison remains diagnostic and currently overlaps zero. DGW row-level quality remains gated, but its gameweek-clustered significance is also diagnostic: only 11 held-out DGW gameweeks are available and the current interval overlaps zero. The UI labels that evidence as limited rather than implying SGW-level support.
