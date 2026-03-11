# FPL SquadPilot

Portfolio-oriented web app that recommends one projected Fantasy Premier League squad for the next gameweek.

## Current status

- MVP build path is implemented through Milestone 6.
- App generates a legal recommended 15-man squad, starting XI, captain, vice-captain, and bench order.
- Optional Team ID import is supported with clean valid/invalid states.
- Results dashboard includes pitch, bench, cards, explanation panel, and import comparison.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- `javascript-lp-solver` for optimization

## Setup

1. Install dependencies:

```bash
npm install
```

2. Run development server:

```bash
npm run dev
```

3. Open:

```text
http://localhost:3000
```

## Scripts

- `npm run dev` - start local dev server
- `npm run build` - build production bundle
- `npm run start` - run production server
- `npm run lint` - run ESLint

## High-level architecture (current)

- `app/page.tsx` - dashboard input + results flow
- `app/api/recommend/route.ts` - orchestration route for fetch, scoring, solving, and response shaping
- `components/` - pitch, bench, player card, and explanation presentation
- `lib/fpl/` - FPL fetchers, normalization, Team ID import handling
- `lib/recommendation/` - shared API response/view types for UI rendering
- `lib/scoring/` - fixed-weight feature scoring and explanation generation
- `lib/solver/` - MILP recommendation model + fallback heuristic
- `lib/server/rate-limit.ts` - basic inbound route throttling

## Limitations (current)

- Next-gameweek scope only (no multi-week planning)
- One recommended squad path only (no multiple variants)
- Fixed scoring weights (no ML forecasting)
- No auth/accounts or chip planning
- In-memory cache and rate limit are process-local

## Behavior notes

- Recommendation route uses server-side FPL fetch only (no browser direct FPL calls).
- Upstream 429 responses use exponential backoff and return clear retry states.
- Route applies basic per-client inbound throttling and returns `RATE_LIMITED` on 429.
- Team ID is transient request input and not persisted to storage.
- Team ID import depends on public picks availability and fails cleanly when picks are unavailable.

## Key Technical Decisions

### 1) Single-stack Next.js + TypeScript

- Decision: keep frontend and backend logic inside one Next.js app.
- Context / constraint: MVP requires fast solo delivery and server-side FPL proxying.
- Alternatives considered: separate Python backend with React frontend.
- Reason chosen: faster build/deploy loop with less coordination overhead.
- Trade-offs/downside: JS solver options may be less flexible than Python tooling.

### 2) Tailwind-first UI shell

- Decision: use Tailwind utility styling with lightweight design tokens.
- Context / constraint: need polished dashboard feel quickly.
- Alternatives considered: custom CSS architecture from scratch.
- Reason chosen: faster iteration and consistent visual primitives.
- Trade-offs/downside: utility class strings can grow long if not kept disciplined.

### 3) Fixed-weight scoring + template explanations

- Decision: use explicit weighted factors with template-generated explanation text.
- Context / constraint: MVP must be explainable and fast to ship.
- Alternatives considered: ML model or free-form AI explanation generation.
- Reason chosen: deterministic behavior and direct traceability from factors to UI explanation.
- Trade-offs/downside: lower sophistication than learned forecasts.

### 4) MILP primary solver with fallback heuristic

- Decision: solve squad constraints with MILP and keep a fallback greedy path.
- Context / constraint: recommendation must still return usable output under solver issues.
- Alternatives considered: heuristic-only selection.
- Reason chosen: MILP enforces core constraints reliably; fallback improves resilience.
- Trade-offs/downside: added complexity in solver modeling and validation.

### 5) In-memory cache + route throttling for MVP hardening

- Decision: use lightweight in-memory caching and sliding-window rate limiting.
- Context / constraint: reduce repeated upstream requests and abuse risk without adding a database.
- Alternatives considered: external cache/database.
- Reason chosen: simplest reliable MVP hardening path.
- Trade-offs/downside: cache/limits reset on process restart and are not shared across instances.
