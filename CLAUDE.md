# Euch-Online — Project Rules

## What this is
Real-time 4-player Euchre platform. React + Vite + TypeScript frontend, Supabase for auth/database/realtime. Full feature set target: mandatory accounts, configurable house rules, bump/betting system, reneg challenges, hand analytics. Built in sequential phases — do not build ahead of what's asked for in the current task.

## Stack
- React + Vite + TypeScript
- Supabase (Auth, Postgres, Realtime, Edge Functions) — no separate backend server, no Socket.io, no Prisma
- Styling: plain CSS/CSS modules unless told otherwise

## Standing rules
- Always run `npx tsc -b` (not plain `tsc`, which no-ops in this project-reference setup) after making changes and fix all resulting errors before considering a task done
- No git commands except `git add`, `git commit`, and `git stash` — and only when explicitly told to run them. Never run these unprompted, never run any other git command (push, rebase, reset, etc.) at all
- No em dashes, anywhere — code comments, UI copy, commit messages, any written output
- Never touch game logic/rules engine code unless specifically asked — most tasks are additive, not rewrites
- Ask before assuming schema fields, table names, or flow details that aren't given explicitly — don't invent columns or endpoints
- Keep tasks scoped to exactly what's asked — don't add auth features while doing game-engine work, don't add UI polish while doing schema work, etc.
- Before making any change to bidding, scoring, or rules-engine logic (`make-bid`, `discard-card`, `play-card`, `src/engine/*`, or anything governing what's legal in the game), read `docs/EUCHRE_RULES.md` first and cross-reference the change against it. If a request conflicts with what's documented there, flag the discrepancy explicitly rather than silently implementing the request or silently keeping the old behavior — ask which one is correct.

## Auth model
- Accounts are mandatory. There is no guest/anonymous play anywhere in this app.
- Supabase Auth handles email/password. `profiles` table (id references auth.users) extends it with display_name. A trigger auto-creates the profile row on signup from metadata.

## Database
- All hidden information (players' hands) lives in tables with RLS locked down to no client-read policies. Access to a player's own hand goes through an Edge Function that validates identity server-side, never a direct client read.
- Public game state (games, players, tricks, trick_plays, hands minus card contents) is client-readable directly.
- Card plays and dealing are validated server-side (Edge Functions), never trusted from client writes directly.

## Future plans
- The website (this repo's stack: React/Vite/Supabase) is and remains the primary, main version of the app. Nothing below changes that.
- An iOS App Store version is a future goal, not a near-term task. The likely approach is Capacitor wrapping the existing web app, not a full React Native rebuild — that reuses the current frontend and Supabase backend with the least duplication. This is noted here so current architecture choices don't quietly foreclose it, not as a task to start on.
- **App Store constraint on the settlement/bump system:** the bump/betting system (Section 5.3 of the original architecture doc, the `units_owed` formula) has not been built yet. Whenever it is built, the mobile app version must never reference money, currency, dollar amounts, or stakes anywhere in its UI — App Store review scrutinizes wagering-adjacent features closely. The mobile version can still track and display bump counts/events (euchre, sweep, loner variants, etc.) as neutral point tallies, but must not show "X owes Y $__" or any dollar-sign framing.
- The web version already uses neutral "units" language (not literal currency), which is a reasonable baseline to keep consistent across both platforms. **This is an open decision, not yet made:** when the settlement/bump system actually gets built, explicitly decide between (a) one neutral-units design shared by both web and mobile, or (b) web keeps dollar framing and only mobile is restricted to neutral units. Don't silently pick one — ask.