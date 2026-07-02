# Euch-Online — Project Rules

## What this is
Real-time 4-player Euchre platform. React + Vite + TypeScript frontend, Supabase for auth/database/realtime. Full feature set target: mandatory accounts, configurable house rules, bump/betting system, reneg challenges, hand analytics. Built in sequential phases — do not build ahead of what's asked for in the current task.

## Stack
- React + Vite + TypeScript
- Supabase (Auth, Postgres, Realtime, Edge Functions) — no separate backend server, no Socket.io, no Prisma
- Styling: plain CSS/CSS modules unless told otherwise

## Standing rules
- Always run `npx tsc` after making changes and fix all resulting errors before considering a task done
- No git commands except `git add`, `git commit`, and `git stash` — and only when explicitly told to run them. Never run these unprompted, never run any other git command (push, rebase, reset, etc.) at all
- No em dashes, anywhere — code comments, UI copy, commit messages, any written output
- Never touch game logic/rules engine code unless specifically asked — most tasks are additive, not rewrites
- Ask before assuming schema fields, table names, or flow details that aren't given explicitly — don't invent columns or endpoints
- Keep tasks scoped to exactly what's asked — don't add auth features while doing game-engine work, don't add UI polish while doing schema work, etc.

## Auth model
- Accounts are mandatory. There is no guest/anonymous play anywhere in this app.
- Supabase Auth handles email/password. `profiles` table (id references auth.users) extends it with display_name. A trigger auto-creates the profile row on signup from metadata.

## Database
- All hidden information (players' hands) lives in tables with RLS locked down to no client-read policies. Access to a player's own hand goes through an Edge Function that validates identity server-side, never a direct client read.
- Public game state (games, players, tricks, trick_plays, hands minus card contents) is client-readable directly.
- Card plays and dealing are validated server-side (Edge Functions), never trusted from client writes directly.