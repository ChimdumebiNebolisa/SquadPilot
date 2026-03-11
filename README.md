# FPL SquadPilot

Portfolio-oriented web app that recommends one projected Fantasy Premier League squad for the next gameweek.

## Current status

- Milestone 1 foundation is implemented.
- Next.js + TypeScript + Tailwind app shell is running.
- Home page includes Team ID input, Generate action, and placeholder recommendation state.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS

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

- `app/` - UI routes and page shell
- `components/` - reusable UI components (to be added in later milestones)
- `lib/` - FPL fetch/scoring/solver modules (to be added in later milestones)
- `app/api/recommend/` - recommendation route (to be added in later milestones)

## Limitations (current)

- No live FPL data ingestion yet
- No scoring model yet
- No optimization solver yet
- No Team ID import handling yet

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
