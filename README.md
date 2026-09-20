# FPL SquadPilot

SquadPilot is a deterministic, source-backed FPL decision tracker. It recommends a legal 15-player squad, starting XI, captain, vice-captain, and bench order for the next gameweek. It does not use an LLM, paid API, subjective football opinions, predicted lineups, manager-style analysis, or automatic transfers.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## Data boundary

All live requests are server-side and cached in memory with retry, stale-cache fallback, and sync metadata.

- **FPL public API** is live truth for current players, prices, points, form, minutes, starts, availability, news, chance-of-playing fields, expected goals/assists where supplied, FPL `ep_next`, set-piece order, team strengths, fixtures, home/away status, double gameweeks, and optional Team ID data.
- **Vaastav’s Fantasy Premier League repository** is historical evidence only. Run `node scripts/sync-vaastav.mjs --season 2024-25` to import a season into `data/historical/`. The app does not fetch those CSV files during a user request.

Every normalized record carries source, season, gameweek or fixture, as-of time, confidence, and availability status. Historical player joins prefer FPL element IDs; fallback identity matching is explicit and low-confidence. Missing historical data is displayed as “insufficient historical data”.

The repository does not claim support for manager tactical style, manager-specific opponent records, external predicted lineups, or injury information beyond FPL’s own status/news/chance fields. FPL `ep_next` is shown as a baseline comparator; it is not added again as an independent score signal. Start and points estimates are deterministic heuristics, not calibrated probabilities.

## Recommendation model

The score groups information into availability, expected minutes, recent production, season baseline, historical baseline, fixture context, opponent history, role/set pieces, and value. Correlated fields are capped or kept as a comparator instead of being blindly added together. A double gameweek aggregates every upcoming fixture for the team; the UI shows each fixture’s opponent and home/away status.

Opponent history uses current-season FPL element-summary history when it is fetched for a supplied Team ID, plus imported Vaastav match-level data for older seasons. Small samples are shrunk toward the player baseline and the sample size is returned. No history means no invented estimate.

The optimizer preserves FPL constraints:

- 15 players: 2 GK, 5 DEF, 5 MID, 3 FWD
- £100m budget
- maximum three players per club
- legal starting formations
- captain and vice-captain linked to the starting XI
- multiple fixtures supported in a gameweek

If the MILP cannot solve, the fallback first constructs the cheapest legal position- and club-valid squad, upgrades only within budget, and returns an error rather than an over-budget squad.

## Optional Team ID

Enter an FPL Team ID before generating. SquadPilot then attempts to load the current squad, captain, vice-captain, bank, transfers where FPL supplies them, and history. It compares the current squad with the generic recommendation and gives deterministic starting-XI, captain, vice-captain, and weak-player suggestions. It never makes transfers automatically.

## Historical import and backtesting

The reproducible importer is `scripts/sync-vaastav.mjs`. It downloads the allowed Vaastav files, normalizes gameweek records, and writes JSON under `data/historical/` for the application to read.

The walk-forward path is documented in [`docs/backtesting.md`](docs/backtesting.md). It only exposes records with gameweek earlier than the evaluated deadline, excludes post-match expected-point fields, and reports projection error, rank correlation, captain hit rate, start-estimate calibration, position and double-gameweek slices, recent-form comparison, and FPL `ep_next` comparison.

## Attribution

- Live data: [Fantasy Premier League public API](https://fantasy.premierleague.com/api/)
- Historical data: [Vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League)

See [`docs/backtesting.md`](docs/backtesting.md) for the calibration boundary and reproducibility notes.
