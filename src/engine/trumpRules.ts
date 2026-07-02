import type { Card, Rank, Suit } from './types'

const RANK_VALUE: Record<Rank, number> = {
  '9': 0,
  '10': 1,
  J: 2,
  Q: 3,
  K: 4,
  A: 5,
}

function sameColorSuit(suit: Suit): Suit {
  switch (suit) {
    case 'clubs':
      return 'spades'
    case 'spades':
      return 'clubs'
    case 'diamonds':
      return 'hearts'
    case 'hearts':
      return 'diamonds'
  }
}

/** True if `card` is the left bower given the current trump suit: the Jack of the same-color suit. */
export function isLeftBower(card: Card, trumpSuit: Suit): boolean {
  return card.rank === 'J' && card.suit === sameColorSuit(trumpSuit)
}

export function isRightBower(card: Card, trumpSuit: Suit): boolean {
  return card.rank === 'J' && card.suit === trumpSuit
}

/** The suit this card effectively belongs to for trick-taking purposes, accounting for the left bower. */
export function getEffectiveSuit(card: Card, trumpSuit: Suit): Suit {
  if (isLeftBower(card, trumpSuit)) {
    return trumpSuit
  }
  return card.suit
}

const TIER_RIGHT_BOWER = 400
const TIER_LEFT_BOWER = 390
const TIER_TRUMP = 300
const TIER_LED = 200
const TIER_OFF = 100

/**
 * Numeric rank for comparing two cards within a single trick.
 * Ordering: right bower > left bower > other trump > led-suit non-trump > off-suit.
 * Off-suit cards can never win a trick, so their relative ordering among themselves is arbitrary
 * but still deterministic (by card value) for stable sorting.
 */
export function getCardRank(card: Card, trumpSuit: Suit, ledSuit: Suit): number {
  if (isRightBower(card, trumpSuit)) {
    return TIER_RIGHT_BOWER
  }
  if (isLeftBower(card, trumpSuit)) {
    return TIER_LEFT_BOWER
  }

  const effectiveSuit = getEffectiveSuit(card, trumpSuit)

  if (effectiveSuit === trumpSuit) {
    return TIER_TRUMP + RANK_VALUE[card.rank]
  }
  if (effectiveSuit === ledSuit) {
    return TIER_LED + RANK_VALUE[card.rank]
  }
  return TIER_OFF + RANK_VALUE[card.rank]
}
