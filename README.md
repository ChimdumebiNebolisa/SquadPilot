# FPL SquadPilot

Web app that recommends one Fantasy Premier League squad for the next gameweek: 15 players, starting XI, captain, vice-captain, and bench order. One-click generate; no Team ID or login.

## How to run

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the dev server**

   ```bash
   npm run dev
   ```

3. **Open** [http://localhost:3000](http://localhost:3000)

**Other scripts**

- `npm run build` — production build  
- `npm run start` — run production server  
- `npm run lint` — run ESLint  

## How it works

1. You click **Generate Squad** on the home page.
2. The app calls **`POST /api/recommend`**, which:
   - Fetches next-gameweek data from the public FPL API (bootstrap-static, fixtures).
   - Normalizes players, teams, and fixtures.
   - **Scores** every player with a weighted feature model and turns that into a single projected score and a calibrated “5+ points” chance.
   - **Solves** for a legal 15-man squad (budget, positions, 11 starters, 1 captain) using a MILP solver; if that fails, a greedy fallback picks the squad.
   - Enriches each player with next-GW opponent and returns the recommendation.
3. The UI shows the recommended squad on a **pitch view** (formation + bench), a **list view**, and a **player detail sheet** (projected points, expected minutes, % chance of starting, 5+ pts %, fixture difficulty, and short rationale).

All FPL requests are made server-side. The app uses in-memory caching and per-client rate limiting to reduce load on the FPL API.

## Scoring

Scoring is **deterministic** and **weighted by position**. There is no ML model; each player gets a 0–1 score per factor, then a weighted sum is turned into projected points and used for ordering and squad selection.

### 1. Features (per player)

Features are derived from FPL data and next-GW fixtures and normalized to roughly 0–1 where higher is better:

| Factor | Meaning |
|--------|--------|
| **recentForm** | FPL “form” (normalized 0–10). |
| **pointsPerGame** | Season points per game (normalized). |
| **expectedMinutes** | Chance they play × historical share of 90 mins (from `minutesPlayedSeason` and `gameweeksPlayed`). Reduced if status is injured/suspended. |
| **fixtureDifficulty** | Next-GW fixture difficulty (1–5 from FPL), inverted and normalized so easier = higher. |
| **homeAway** | Home (1) / away (0) / unknown (0.5). |
| **opponentStrength** | Opponent team strength from API, normalized so weaker opponent = higher. |
| **value** | Points-per-game per price (value for money), capped. |
| **differential** | Lower ownership = higher (normalized from `selectedByPercent`). |
| **health** | Availability: FPL `chance_of_playing_next_round` or status (e.g. “a” = 1, “d” = 0.4, “i”/“s” = 0.15). |
| **fplExpectedPoints** | FPL’s `ep_next` for the next GW (scale 0–15 → 0–1). |
| **attackingUpside** | ICT index for MID/FWD only (0 for GK/DEF), normalized. |

### 2. Weights (by position)

Each position uses a **base** set of weights; GK/DEF/MID/FWD then apply overrides (e.g. GK down-weights value and expected minutes; MID/FWD add attacking upside). The weighted sum over all factors is the raw **projected score**; that is scaled (×10) to get **projected points** shown in the UI.

### 3. Projected points and 5+ chance

- **Projected points** = `sum(factor × weight)` × 10, rounded. Used to rank players and as the main objective in the solver.
- **5+ points chance** = a separate, calibrated probability (sigmoid-style) that the player scores at least 5 in the next GW. It uses projected points, expected minutes, fixture difficulty, form, health, value, and points-per-game, with position-specific thresholds and bounds. This is shown in the UI as “5+ pts %” and is used as a small secondary signal in the solver (projected score + 0.3 × 5+ chance).

### 4. % chance of starting

A separate, deterministic metric: **availability** (from FPL `chance_of_playing_next_round` or status) × **historical start rate** (minutes this season ÷ gameweeks ÷ 90, capped at 1). Shown in the player detail sheet as “% chance of starting”.

### 5. Squad selection (solver)

- **MILP** (javascript-lp-solver): maximize sum of (projected score + 0.3 × 5+ chance) over the 15-man squad and 11 starters, subject to budget (100), position limits (2 GK, 5 DEF, 5 MID, 3 FWD), formation (e.g. 3–5–2, 4–4–2), and one captain. Candidate pool is built from top/cheap players per position so the problem stays small.
- If the MILP fails or returns nothing, a **greedy fallback** fills the 15 and then the XI by position and projected score.

## Stack

- **Next.js** (App Router), **TypeScript**, **Tailwind CSS**
- **javascript-lp-solver** for the MILP squad/XI optimization
