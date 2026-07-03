# Euch-Online

A real-time 4-player Euchre platform: mandatory accounts, configurable house rules, bump/betting, reneg challenges, hand analytics. Built in sequential phases, server-authoritative from the start (no client-trusted card plays, no client reads of hidden hands).

Designed by Josh Cohn - product scope, architecture decisions, database/security model, and every phase's requirements. Built by [Claude Code](https://claude.com/claude-code).

## Stack

- React + Vite + TypeScript (frontend)
- Supabase: Auth, Postgres, Realtime, Edge Functions (no separate backend server, no Socket.io, no Prisma)
- Deno (Edge Functions runtime)
- Vitest (engine unit tests)

## Status

### Phase 0 - Auth
Supabase email/password auth. A `profiles` table extends `auth.users` with `display_name`, auto-populated by a trigger on signup.

### Phase 1 - Game engine
Pure, framework-free Euchre rules in [src/engine/](src/engine/), fully unit-tested:
- `deck.ts` - build/shuffle/deal a 24-card deck
- `trumpRules.ts` - effective suit, right/left bower, card ranking given trump
- `bidding.ts` - both bid rounds (order-up, call-suit), stick-the-dealer
- `trickResolution.ts` - follow-suit legality, trick winner resolution
- `scoring.ts` - hand scoring (march, make, euchre, alone)
- `throwdownEvaluator.ts` - detects when a hand's outcome is already mathematically locked

This layer has no I/O and is imported directly by the Edge Functions below - the rules are defined once and enforced server-side, not reimplemented per endpoint.

### Phase 2 - Server-authoritative gameplay + Realtime (in progress)
Edge Functions in [supabase/functions/](supabase/functions/), each verifying the caller's JWT and seat before doing anything:

| Function | Does |
|---|---|
| `deal-hand` | Shuffles and deals a new hand, stores each seat's cards server-side |
| `get-my-hand` | Returns only the caller's own cards - the sole read path for hidden hand contents |
| `make-bid` | Processes order-up / call-suit / pass for both bid rounds, sets trump and maker |
| `discard-card` | Lets the dealer discard down to 5 cards after an order-up, marks the hand playable |
| `play-card` | Validates a card play (own card, legal follow-suit, correct turn) and resolves tricks |

All four state-changing functions broadcast a `game_event` over a private Supabase Realtime channel (`game:{gameId}`, gated by RLS to seated players only) after their write succeeds, so [src/hooks/useGameChannel.ts](src/hooks/useGameChannel.ts) can push live updates to other seated clients instead of polling.

Database schema (see [supabase/migrations/](supabase/migrations/)):
- `games`, `players` - public game/seat state, client-readable
- `hands`, `tricks`, `trick_plays`, `bids` - public game progress, client-readable
- `hand_cards` - **zero client-read policies**; the only way to see a hand's contents is through `get-my-hand`, which checks identity server-side

### Not yet built
Bump/betting system, reneg challenges, hand analytics, house-rules configuration (lobby/room creation), scoring/hand-completion flow, and all UI beyond auth.

## Project layout

```
src/
  engine/       pure game rules (shared with Edge Functions via relative import)
  realtime/     GameEvent types shared between client and Edge Functions
  hooks/        useGameChannel - subscribes to a game's live event stream
  context/      AuthContext - current user/session
  pages/        Auth
  lib/          Supabase client
supabase/
  functions/    Edge Functions (Deno)
  migrations/   versioned schema changes
scripts/
  verify-broadcast.mjs   regression check for Realtime broadcast delivery
```

## Running locally

```bash
npm install
npm run dev        # start the Vite dev server
npm test            # run engine unit tests (Vitest)
npx tsc             # type-check the frontend
```

Requires a `.env.local` with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Edge Functions are type-checked separately with Deno:
```bash
cd supabase/functions
deno check deal-hand/index.ts get-my-hand/index.ts make-bid/index.ts discard-card/index.ts play-card/index.ts _shared/broadcast.ts
```

Schema changes are applied with the Supabase CLI:
```bash
supabase db push
```
