# Contributing

## Development

Use Node.js 24 and install the exact dependency graph with `npm ci`. Create focused changes that preserve the list-based experience and the optional Team ID flow.

Before submitting a pull request, run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run verify:historical
npm run backtest
npm run build
npm audit --omit=dev --audit-level=high
```

Historical data changes must remain pinned to the commit in `data/historical/sources.json`. Run `npm run verify:reimport` when changing the importer or snapshots. Generated model changes must include the content-hashed artifact and pass the held-out release gates.

Do not commit credentials, `.env` files, `.vercel`, or user-specific FPL data. By contributing, you agree that your contribution is licensed under the MIT License.
