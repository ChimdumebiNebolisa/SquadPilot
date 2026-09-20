# Walk-forward backtesting

SquadPilot’s historical path is deliberately reproducible and conservative. It uses only Vaastav match-level records imported with `scripts/sync-vaastav.mjs`. The evaluator must build a prediction input from records with `round < evaluatedRound`; the evaluated round’s points are used only as the outcome. Vaastav expected-point fields are excluded from the predictor because some snapshots contain post-match information.

## Run

```bash
node scripts/sync-vaastav.mjs --season 2023-24
node scripts/sync-vaastav.mjs --season 2024-25
npm run backtest -- --season 2024-25
```

The backtest command is intentionally a separate path from live recommendation requests. It should be run after importing the local season file and should report the season and record count in its output.

## Required report

For each walk-forward gameweek, compare the projected points available before the deadline with actual FPL `total_points` and report:

- mean absolute projection error;
- Spearman rank correlation;
- captain recommendation hit rate;
- start-estimate calibration by estimate bucket;
- performance by GK, DEF, MID, and FWD;
- single versus double gameweeks;
- a simple recent-form baseline;
- FPL `ep_next` as a separate baseline comparator.

Calibration means comparing start-estimate buckets with observed starts. It does not turn the estimate into a probability claim automatically. Feature weights must be selected on a training period and evaluated on a later out-of-sample period; a one-season improvement is not sufficient evidence to increase a weight.

When no local `data/historical/*.json` file exists, the UI and API report missing historical data rather than silently mocking it.
