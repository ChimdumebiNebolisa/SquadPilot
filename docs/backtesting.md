# Walk-forward backtesting

SquadPilot’s historical path is deliberately reproducible and conservative. It uses only Vaastav match-level records imported with `scripts/sync-vaastav.mjs`. The evaluator must build a prediction input from records with `round < evaluatedRound`; the evaluated round’s points are used only as the outcome. Vaastav expected-point fields are excluded from the predictor because some snapshots contain post-match information.

## Run

```bash
node scripts/sync-vaastav.mjs --season 2023-24
node scripts/sync-vaastav.mjs --season 2024-25
npm run backtest -- --season 2024-25
```

The backtest command reads the checked-in compressed snapshot and reports the season and record count. The live recommendation path reads the same normalized snapshots for previous-season and opponent enrichment.

## Required report

For each walk-forward gameweek, compare the projected points available before the deadline with actual FPL `total_points` and report:

- mean absolute projection error;
- Spearman rank correlation;
- captain recommendation hit rate;
- start-estimate calibration by estimate bucket;
- performance by GK, DEF, MID, and FWD;
- single versus double gameweeks;
- a simple recent-form baseline;
- FPL `ep_next` as a separate baseline comparator when that field is present in the allowed historical snapshot.

The shipped walk-forward projection blends the last five match-point average (55%) with a minutes-adjusted points-per-90 estimate (45%), then multiplies by the scheduled fixture count. It is deliberately a small deterministic historical evaluator, not a claim that the live FPL feature weights are calibrated by these two seasons. The report also includes the simple recent-form-only baseline beside the projection.

Calibration means comparing start-estimate buckets with observed starts. It does not turn the estimate into a probability claim automatically. Feature weights must be selected on a training period and evaluated on a later out-of-sample period; a one-season improvement is not sufficient evidence to increase a weight.

The shipped repository contains historical snapshots. If a snapshot is deliberately removed in a development checkout, the UI and API report insufficient historical data; the production build rejects that state instead of silently shipping a live-only app.
