# FPL SquadPilot

SquadPilot produces a legal, list-based FPL squad, starting XI, ordered bench, captain, and vice-captain for the next gameweek. An optional Team ID adds a comparison with the latest deadline-passed picks; it never makes transfers or stores account credentials.

## Local development

Use Node.js 24.

```bash
npm ci
npm run dev
```

The main release checks are:

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run verify:historical
npm run backtest
npm run build
npm audit --omit=dev --audit-level=high
```

## Data and identity

Current player, team, fixture, and optional Team ID data come from the public FPL API. Public bootstrap and fixture responses use fixed Vercel Runtime Cache keys with independent freshness limits. Team ID responses remain in a bounded, short-lived process-local LRU and are never placed in shared cache.

Historical records come from the [Vaastav Fantasy Premier League repository](https://github.com/vaastav/Fantasy-Premier-League) at the immutable commit in `data/historical/sources.json`. Cross-season joins use stable FPL `code` and `team_code`; season-local element/team IDs are retained only as provenance. Each snapshot records SHA-256 hashes for every source CSV. Runtime aggregates and walk-forward training records are separate schema-v2 artifacts.

Rebuild and verify the checked-in data with:

```bash
npm run sync:historical -- --season 2024-25
npm run sync:historical -- --season 2025-26
npm run verify:reimport
```

## Projection model

The checked-in model is trained on leakage-free pre-gameweek states from 2024-25 and held out on 2025-26. Projected points use position-specific ridge models and monotonic point calibration. The separate 5+ classifier uses only inputs that the same pure feature builder can reproduce historically and in production: season points and minutes per completed team fixture, fixture difficulty, venue mix, value efficiency, and fixture count. It has position-specific single-gameweek calibration and a pooled double-gameweek calibration. Availability is intentionally reported through the separate starting outlook rather than folded into the calibrated statistic. The artifact version is derived from a SHA-256 content hash. FPL `ep_next` is comparator-only and is not an input.

`npm run backtest` enforces these holdout gates:

- MAE and gameweek rank correlation beat the recent-form baseline;
- the historically calibrated 5+ model estimate beats the base-rate Brier score;
- expected calibration error is at most 0.08.
- every position and the high-minutes candidate cohort beat their own base-rate Brier score, remain within the calibration limit, and have a gameweek-clustered 95% Brier-difference interval below zero;
- double-gameweek probability beats its base-rate Brier score, has expected calibration error at most 0.08, and absolute bias at most 0.05.

Captain hit rate plus positional and double-gameweek slices are reported as diagnostics. The DGW slice passes the row-level Brier, calibration, and bias thresholds, but spans only 11 held-out gameweeks and its gameweek-clustered interval overlaps zero; the API and player detail therefore mark DGW evidence as limited. A valid fixture feed with no next-gameweek fixture is treated as a confirmed blank, so the player is excluded. Missing or invalid fixture data fails safely instead of creating neutral projections.

## API

`POST /api/recommend` accepts `{ "teamId": 123 }` or `{}`. Responses use schema v2: one compact `squad` array plus player ID references for the XI, bench, captain, and vice-captain. The projected total includes the captain bonus. Freshness is reported independently for bootstrap, fixtures, historical data, and optional Team ID data.

See [docs/backtesting.md](docs/backtesting.md), [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
