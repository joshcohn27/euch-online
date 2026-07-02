import type { Card, HandState, Seat, Suit, Team } from './types'
import { teamOfSeat } from './types'
import { buildDeck } from './deck'
import { getCardRank, getEffectiveSuit } from './trumpRules'

export type ThrowdownCondition = 'trick_lock' | 'count_lock' | 'loner_lock'

export interface ThrowdownResult {
  decided: boolean
  condition: ThrowdownCondition | null
  projectedWinnerTeam: Team | null
}

const NOT_DECIDED: ThrowdownResult = { decided: false, condition: null, projectedWinnerTeam: null }

const FULL_DECK = buildDeck()
const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']

function cardKey(card: Card): string {
  return `${card.suit}:${card.rank}`
}

/**
 * Evaluates whether the outcome of the current hand is already certain, from `fromSeat`'s
 * point of view.
 *
 * This deliberately models imperfect information: even though `handState` (the engine's
 * canonical, server-side state) technically contains every seat's hand, this function only
 * reads `fromSeat`'s own hand plus `cardsSeen` (cards already played face-up this hand). It
 * never assumes it knows which unseen card sits in which opponent's hand versus buried in
 * the kitty -- callers should include any other publicly-known card (e.g. a turned-up card
 * that was later turned back down) in `cardsSeen`.
 *
 * Conditions, checked in order (most certain/cheapest first):
 * - count_lock: a team already holds 3+ tricks this hand, so the other team can no longer
 *   avoid (or achieve) a euchre. Pure public information -- doesn't depend on fromSeat.
 * - loner_lock: fromSeat went alone as the maker, holds the highest remaining card of every
 *   suit that still has live cards out, and no trump remains unaccounted for outside their
 *   own hand (so no opponent can possibly hold trump).
 * - trick_lock: same as loner_lock's card conditions, but for any player (not just a lone
 *   maker) -- fromSeat's team is guaranteed to win every remaining trick.
 */
export function evaluateThrowdown(handState: HandState, cardsSeen: Card[], fromSeat: Seat): ThrowdownResult {
  if (handState.trumpSuit === null || handState.makerTeam === null) {
    return NOT_DECIDED
  }
  const trumpSuit = handState.trumpSuit

  const countLockTeam = findCountLockTeam(handState)
  if (countLockTeam !== null) {
    return { decided: true, condition: 'count_lock', projectedWinnerTeam: countLockTeam }
  }

  const ownHand = handState.hands[fromSeat]
  const seenKeys = new Set([...ownHand, ...cardsSeen].map(cardKey))

  const unaccountedTrumpCount = FULL_DECK.filter(
    (c) => getEffectiveSuit(c, trumpSuit) === trumpSuit && !seenKeys.has(cardKey(c)),
  ).length
  const noOpponentHoldsTrump = unaccountedTrumpCount === 0

  const holdsTopOfEverySuit = holdsHighestRemainingOfEveryLiveSuit(ownHand, seenKeys, trumpSuit)

  if (!holdsTopOfEverySuit || !noOpponentHoldsTrump) {
    return NOT_DECIDED
  }

  const isLoneMaker = handState.wentAlone && handState.maker === fromSeat
  if (isLoneMaker) {
    return { decided: true, condition: 'loner_lock', projectedWinnerTeam: teamOfSeat(fromSeat) }
  }

  return { decided: true, condition: 'trick_lock', projectedWinnerTeam: teamOfSeat(fromSeat) }
}

function findCountLockTeam(handState: HandState): Team | null {
  const teams: Team[] = [0, 1]
  for (const team of teams) {
    if (handState.tricksWon[team] >= 3) {
      return team
    }
  }
  return null
}

/**
 * True if, for every suit (effective suit, so the left bower counts as trump) that still has
 * at least one card of unknown location, `ownHand` holds a card of that suit beating the
 * highest such unknown card. A suit fully accounted for (all its cards are either in `ownHand`
 * or already seen) is not "live" and is skipped.
 */
function holdsHighestRemainingOfEveryLiveSuit(ownHand: Card[], seenKeys: Set<string>, trumpSuit: Suit): boolean {
  for (const suit of SUITS) {
    const remainingOfSuit = FULL_DECK.filter(
      (c) => getEffectiveSuit(c, trumpSuit) === suit && !seenKeys.has(cardKey(c)),
    )

    if (remainingOfSuit.length === 0) {
      continue
    }

    const highestUnknownRank = Math.max(...remainingOfSuit.map((c) => getCardRank(c, trumpSuit, suit)))

    const ownRanksOfSuit = ownHand
      .filter((c) => getEffectiveSuit(c, trumpSuit) === suit)
      .map((c) => getCardRank(c, trumpSuit, suit))

    // remainingOfSuit is cards of unknown location (not mine, not seen played) -- fromSeat is
    // only safe from this suit if their best card beats the best card that could still be
    // hiding in an opponent's hand.
    if (ownRanksOfSuit.length === 0 || Math.max(...ownRanksOfSuit) < highestUnknownRank) {
      return false
    }
  }

  return true
}
