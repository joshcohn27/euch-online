import type { Card, Seat, Suit, TrickState } from './types'
import { getCardRank, getEffectiveSuit } from './trumpRules'

/**
 * Determines the winning seat of a trick. Works with 3 or 4 cards played
 * (an alone hand has only 3 active players, so a completed trick may have 3 cards).
 */
export function resolveTrick(trick: TrickState, trumpSuit: Suit): Seat {
  if (trick.cardsPlayed.length === 0) {
    throw new Error('Cannot resolve a trick with no cards played')
  }

  const ledSuit = getEffectiveSuit(trick.cardsPlayed[0].card, trumpSuit)

  let winner = trick.cardsPlayed[0]
  let winnerRank = getCardRank(winner.card, trumpSuit, ledSuit)

  for (const played of trick.cardsPlayed.slice(1)) {
    const rank = getCardRank(played.card, trumpSuit, ledSuit)
    if (rank > winnerRank) {
      winner = played
      winnerRank = rank
    }
  }

  return winner.seat
}

/**
 * True if playing `card` from `hand` is legal given the led suit: the card must follow
 * suit (accounting for the left bower counting as trump) unless the hand holds no card
 * of the led suit, in which case any card may be played.
 */
export function isLegalPlay(card: Card, hand: Card[], ledSuit: Suit, trumpSuit: Suit): boolean {
  const cardEffectiveSuit = getEffectiveSuit(card, trumpSuit)
  const hasLedSuit = hand.some((c) => getEffectiveSuit(c, trumpSuit) === ledSuit)

  if (!hasLedSuit) {
    return true
  }

  return cardEffectiveSuit === ledSuit
}
