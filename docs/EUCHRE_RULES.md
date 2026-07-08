# Euchre Rules Reference

This is the canonical reference for the house rules this implementation follows. It reflects
the rules engine and Edge Functions as they exist in the codebase today, not an idealized or
aspirational design.

**Standing rule:** before changing bidding, scoring, or rules-engine logic (`make-bid`,
`discard-card`, `play-card`, `src/engine/*`, or anything governing what's legal in the game),
read this doc first and cross-reference the change against it. If a request conflicts with
what's documented here, flag the discrepancy explicitly rather than silently implementing the
request or silently keeping the old behavior — ask which one is correct.

Where something is genuinely undecided or not yet built, this doc says so explicitly rather
than guessing at intended behavior.

## Deck and deal

- Standard 24-card Euchre deck: 9, 10, J, Q, K, A in all four suits (`src/engine/deck.ts`).
- Each of the 4 seats is dealt 5 cards. The remaining 4 cards form the kitty; the top card of
  the kitty (`kitty[0]`) is the turned-up card for round 1 bidding.
- Dealing rotates seat-by-seat (`deal-hand` Edge Function); the physical 2-3/3-2 dealing
  pattern used at a real table isn't modeled, since it has no effect on a server-shuffled deck.
- Hidden hand contents (`hand_cards`) are never client-readable directly; a seat's own cards
  are fetched only through `get-my-hand`, which checks identity server-side.

## Bidding round 1

- Bidding order starts with the seat to the dealer's left and proceeds clockwise, dealer last
  (`bidOrderForRound` in `src/engine/bidding.ts`).
- Each seat, in turn, either orders up the turned-up card (optionally going alone) or passes.
- **Any seat, including the dealer, may order up the turned-up card in round 1.** When the
  dealer orders it up themselves, that's the dealer picking up the card — the same action as
  any other seat ordering it up. There is no dealer-specific restriction here; the existing
  turn-order check (only the seat whose turn it is may act) is the only gate needed.
- If a seat orders up: trump is set to the turned-up card's suit, that seat becomes the maker,
  and the dealer picks up the turned-up card into their hand and then discards one card back
  down to 5 (`discard-card`).
- If all 4 seats pass, round 1 ends with no trump set and bidding advances to round 2. The
  turned-up card is turned face-down at this point (it's no longer eligible to be called).

## Bidding round 2

- Same seat order as round 1 (left of dealer, dealer last).
- Each seat may call any suit **except** the suit that was turned down in round 1
  (`isValidRound2Suit`), or pass.
- If a seat calls a suit: trump is set to that suit, that seat becomes the maker. There is no
  discard in round 2 (nothing was picked up).
- **Stick the dealer:** if enabled via `GameRules.stickTheDealer`, and every other seat has
  passed in round 2, the dealer is forced to call a suit and cannot pass
  (`applyStickTheDealer` / `processRound2` throws if the dealer tries to pass in that spot).
  If all 4 seats pass in round 2 with stick-the-dealer *off*, the hand is thrown in (no maker,
  no trump) — the Edge Function reports `allPassed: true` for this case, but **what happens to
  the hand next (redeal? rotate the deal? something else?) is not yet implemented.**

## Going alone

- Any call (order-up in round 1, or call-suit in round 2) may be flagged `alone`, recorded per
  bid on the `bids` table.
- Correctly going alone means the maker's partner sits out the hand entirely; the maker plays
  all 5 tricks alone against the two defenders. `resolveTrick` in `src/engine/trickResolution.ts`
  already supports a 3-card completed trick for exactly this case.
- **Not yet implemented:** the `play-card` Edge Function always cycles turn order through all
  4 seats (`expectedSeat = (leadSeat + nextPlayOrder) % 4`) and always waits for 4 cards before
  resolving a trick. It does not currently skip the sitting-out partner's seat, and the `alone`
  flag isn't copied anywhere onto the `hands` row for later reference — it exists only in the
  `bids` history. Going alone is recorded at bid time but has no effect on trick play yet.

## Trick play

- The seat left of the dealer leads the first trick; thereafter, the winner of each trick leads
  the next.
- A played card must follow the effective suit of the lead card (the left bower counts as
  trump, not its printed suit) unless the player holds no card of that suit, in which case any
  card is legal (`isLegalPlay`). This is enforced server-side in `play-card` — an illegal play
  is rejected outright, not merely detected after the fact.
- Card power within a trick, highest to lowest: right bower (jack of trump) > left bower (jack
  of the same-color suit) > other trump (by rank) > led-suit non-trump (by rank) > off-suit
  (can never win) (`getCardRank`).

## Scoring and game end

- Hand scoring (`scoreHand` in `src/engine/scoring.ts`):
  - Maker's team takes all 5 tricks (march/sweep): **2 points**, or **4 points** if they went
    alone.
  - Maker's team takes 3 or 4 tricks (made it): **1 point**.
  - Maker's team takes fewer than 3 tricks (euchred): **2 points to the defending team**.
- Game ends at **10 points**. If `GameRules.winByTwo` is enabled, the winner must also be ahead
  by at least 2 points, not just reach 10 first (`isGameOver`).
- **Not yet implemented:** there is no Edge Function that calls `scoreHand`/`isGameOver`, marks
  a hand `complete`, or deals the next hand. `scoreHand` and `isGameOver` are pure, fully unit
  tested engine functions with no caller yet. Right now a hand's fifth trick resolves and
  nothing further happens server-side.

## House rules configuration

- `GameRules` (`stickTheDealer`, `winByTwo`, `throwDowns`) exists as a type, but there is no
  lobby/room UI or `games` table column to configure it per game yet.
- `make-bid`'s `DEFAULT_RULES` is hardcoded to `{ stickTheDealer: false, winByTwo: false,
  throwDowns: false }` as an explicit placeholder, not a house-rules decision — see the `TODO`
  comment directly above it in `supabase/functions/make-bid/index.ts`.

## Accounts

- Accounts are mandatory; there is no guest/anonymous play anywhere in this app. This affects
  rules only insofar as every seat at the table is always a real, authenticated player — there
  is no bot/AI seat-filling and no spectator-to-player conversion to account for in the rules
  engine.

## Bump / reneg challenges / throw-down

The original system architecture doc's Section 6 covering these three systems was not
available when this doc was written, and this doc deliberately does not guess at their
intended rules. What's actually true today:

- **Bump / betting system:** not designed and not implemented anywhere in this codebase — no
  schema, no engine module, no UI. Treat any bump/betting behavior as entirely undefined until
  a spec is provided.
- **Reneg challenges:** not designed and not implemented. Note a real tension worth resurfacing
  when this gets designed: `isLegalPlay` already rejects an illegal (reneging) play server-side
  before it can ever be recorded, so the traditional tabletop notion of "catching" a reneg after
  the fact may not directly apply to a server-authoritative implementation — this needs a
  decision, not an assumption, when the feature is actually specced.
- **Throw-down:** partially built at the engine layer only. `src/engine/throwdownEvaluator.ts`
  (`evaluateThrowdown`) detects when a hand's outcome is already mathematically locked from one
  seat's point of view (`count_lock`, `loner_lock`, `trick_lock`), using only that seat's own
  hand plus publicly-seen cards — it deliberately never assumes knowledge of other seats'
  hidden cards. It is fully unit tested but **not called from any Edge Function** and has no UI
  entry point — there is currently no way for a player to actually invoke a throw-down in a
  live game.

When Section 6's actual content becomes available, this section should be rewritten against it
rather than left as-is.
