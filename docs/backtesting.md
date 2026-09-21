# Walk-forward training and validation

SquadPilot separates compact runtime aggregates under `data/historical/` from match-level training records under `data/backtest/`. Both are generated from the same pinned Vaastav commit and carry the source URLs and SHA-256 input hashes.

## Leakage boundary

For an evaluated gameweek, feature state is built only from that player's records in earlier gameweeks. The current gameweek contributes fixture count, venue, and difficulty but no post-match player fields. FPL expected points are unavailable in the pinned historical source and remain excluded from model inputs in production.

The model uses seven normalized inputs: recent form, season points per game, expected minutes, fixture difficulty, home share, value, and stable-code opponent history. A regularized model is trained separately for GK, DEF, MID, and FWD. Monotonic calibration is fitted on the training season for per-fixture points and the probability of a five-plus-point gameweek. Single-gameweeks retain position-specific probability calibration; double-gameweeks use a pooled calibration because their per-position samples are sparse.

The pinned Vaastav match files do not contain every deadline-time live FPL field, including injury chance and status. The production feature normalizer and prediction path are shared with the backtest, but some historical inputs are reconstructed proxies. For that reason the UI describes the probability as a historically calibrated model estimate rather than claiming exact live-population calibration.

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
- expected calibration error is no greater than 0.08.
- double-gameweek Brier score beats the double-gameweek base rate;
- double-gameweek expected calibration error is no greater than 0.08;
- double-gameweek absolute probability bias is no greater than 0.05.

The report also includes captain 5+ hit rate, position probability slices, and single-/double-gameweek MAE. Those values are diagnostic rather than release gates.
