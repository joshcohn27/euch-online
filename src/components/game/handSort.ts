import type { Card, Suit } from '../../engine/types.ts'
import { getEffectiveSuit, isLeftBower, isRightBower } from '../../engine/trumpRules.ts'

const RANK_ORDER: Record<Card['rank'], number> = {
  '9': 0,
  '10': 1,
  J: 2,
  Q: 3,
  K: 4,
  A: 5,
}

// Alternating colors (black, red, black, red), skipping whichever suit is trump.
const SUIT_ORDER: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds']

// Right bower and left bower outrank every other trump card, including a same-suit ace.
function trumpRankValue(card: Card, trumpSuit: Suit): number {
  if (isRightBower(card, trumpSuit)) return 100
  if (isLeftBower(card, trumpSuit)) return 99
  return RANK_ORDER[card.rank]
}

/**
 * Sorts a hand for display: grouped by suit (alternating colors), highest rank first within
 * each group. Once trump is called, trump cards (including the left bower) move to the front
 * as one group, ranked by trick-taking power rather than raw rank.
 */
export function sortHand(hand: Card[], trumpSuit: Suit | null): Card[] {
  return [...hand].sort((a, b) => {
    const aIsTrump = trumpSuit != null && getEffectiveSuit(a, trumpSuit) === trumpSuit
    const bIsTrump = trumpSuit != null && getEffectiveSuit(b, trumpSuit) === trumpSuit

    if (aIsTrump !== bIsTrump) return aIsTrump ? -1 : 1
    if (aIsTrump && bIsTrump && trumpSuit) return trumpRankValue(b, trumpSuit) - trumpRankValue(a, trumpSuit)

    const aSuit = trumpSuit != null ? getEffectiveSuit(a, trumpSuit) : a.suit
    const bSuit = trumpSuit != null ? getEffectiveSuit(b, trumpSuit) : b.suit
    if (aSuit !== bSuit) return SUIT_ORDER.indexOf(aSuit) - SUIT_ORDER.indexOf(bSuit)

    return RANK_ORDER[b.rank] - RANK_ORDER[a.rank]
  })
}
