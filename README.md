# FPL SquadPilot

SquadPilot produces a legal, list-based FPL squad, starting XI, ordered bench, captain, and vice-captain for the next gameweek. An optional Team ID adds a comparison with the latest deadline-passed picks; it never makes transfers or stores account credentials.

## Local development

Use Node.js 24.

```bash
npm ci
npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete verification workflow.

## Data and identity

Current player, team, fixture, and optional Team ID data come from the public FPL API. Public bootstrap and fixture responses use fixed Vercel Runtime Cache keys with independent freshness limits. Team ID responses remain in a bounded, short-lived process-local LRU and are never placed in shared cache.

Historical records come from the [Vaastav Fantasy Premier League repository](https://github.com/vaastav/Fantasy-Premier-League) at the immutable commit in `data/historical/sources.json`. Cross-season joins use stable FPL `code` and `team_code`; season-local element/team IDs are retained only as provenance. Each snapshot records SHA-256 hashes for every source CSV. Runtime aggregates and walk-forward training records are separate schema-v2 artifacts.

Rebuild and verify the checked-in data with:

```bash
npm run sync:historical -- --season 2023-24
npm run sync:historical -- --season 2024-25
npm run sync:historical -- --season 2025-26
npm run verify:reimport
```

## Projection model

The checked-in model is trained on leakage-free 2024-25 pre-gameweek states, using 2023-24 as previous-season context, and held out on 2025-26. Projected points and the 5+ model estimate use separate models. The probability model combines current performance with stable-code-linked previous-season player and opponent history through the same production/replay feature builder. Availability is reported separately through the starting outlook, and double-gameweek evidence is explicitly marked as limited. The artifact is content-hashed, and FPL `ep_next` is never a model input.

See [docs/backtesting.md](docs/backtesting.md) for feature definitions, reproduction commands, release gates, and evidence limitations.

## API

`POST /api/recommend` accepts `{ "teamId": 123 }` or `{}`. Responses use schema v2: one compact `squad` array plus player ID references for the XI, bench, captain, and vice-captain. The projected total includes the captain bonus. Freshness is reported independently for bootstrap, fixtures, historical data, and optional Team ID data.

Security reporting and third-party attribution are documented in [SECURITY.md](SECURITY.md) and [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
