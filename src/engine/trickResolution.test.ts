import { describe, expect, it } from 'vitest'
import { isLegalPlay, resolveTrick } from './trickResolution'
import { c } from './testUtils'
import type { TrickState } from './types'

describe('resolveTrick', () => {
  it('the left bower wins over other trump and led-suit cards', () => {
    const trick: TrickState = {
      trickNumber: 1,
      leadSeat: 0,
      cardsPlayed: [
        { seat: 0, card: c('spades', '10') }, // led suit
        { seat: 1, card: c('hearts', '9') }, // trump
        { seat: 2, card: c('spades', 'A') }, // high led suit
        { seat: 3, card: c('diamonds', 'J') }, // left bower (trump = hearts)
      ],
      winner: null,
    }

    expect(resolveTrick(trick, 'hearts')).toBe(3)
  })

  it('the right bower beats the left bower', () => {
    const trick: TrickState = {
      trickNumber: 1,
      leadSeat: 0,
      cardsPlayed: [
        { seat: 0, card: c('diamonds', 'J') }, // left bower
        { seat: 1, card: c('hearts', 'J') }, // right bower
        { seat: 2, card: c('hearts', 'A') },
        { seat: 3, card: c('clubs', '9') },
      ],
      winner: null,
    }

    expect(resolveTrick(trick, 'hearts')).toBe(1)
  })

  it('highest card of the led suit wins when no trump is played', () => {
    const trick: TrickState = {
      trickNumber: 1,
      leadSeat: 2,
      cardsPlayed: [
        { seat: 2, card: c('clubs', '9') },
        { seat: 3, card: c('clubs', 'K') },
        { seat: 0, card: c('diamonds', 'A') }, // off suit, cannot win
        { seat: 1, card: c('clubs', 'Q') },
      ],
      winner: null,
    }

    expect(resolveTrick(trick, 'hearts')).toBe(3)
  })

  it('resolves a 3-card trick (alone hand, partner sits out)', () => {
    const trick: TrickState = {
      trickNumber: 1,
      leadSeat: 0,
      cardsPlayed: [
        { seat: 0, card: c('spades', '9') },
        { seat: 1, card: c('spades', 'K') },
        { seat: 3, card: c('hearts', 'A') }, // off suit
      ],
      winner: null,
    }

    expect(resolveTrick(trick, 'clubs')).toBe(1)
  })

  it('throws when no cards have been played', () => {
    const trick: TrickState = { trickNumber: 1, leadSeat: 0, cardsPlayed: [], winner: null }
    expect(() => resolveTrick(trick, 'clubs')).toThrow()
  })
})

describe('isLegalPlay', () => {
  it('requires following suit when the hand holds the led suit', () => {
    const hand = [c('clubs', '9'), c('spades', 'A'), c('hearts', 'K')]
    expect(isLegalPlay(c('clubs', '9'), hand, 'clubs', 'hearts')).toBe(true)
    expect(isLegalPlay(c('spades', 'A'), hand, 'clubs', 'hearts')).toBe(false)
  })

  it('allows any card when void in the led suit', () => {
    const hand = [c('spades', 'A'), c('hearts', 'K')]
    expect(isLegalPlay(c('spades', 'A'), hand, 'clubs', 'hearts')).toBe(true)
    expect(isLegalPlay(c('hearts', 'K'), hand, 'clubs', 'hearts')).toBe(true)
  })

  it('counts the left bower as trump for following the trump suit', () => {
    // trump = hearts; left bower is J of diamonds
    const hand = [c('diamonds', 'J'), c('clubs', '9')]
    expect(isLegalPlay(c('diamonds', 'J'), hand, 'hearts', 'hearts')).toBe(true)
  })

  it('requires playing the left bower (or another trump) when trump is led and hand holds it, even though its native suit differs', () => {
    // trump = hearts; hand has the left bower (J of diamonds) plus an off-suit card.
    // Led suit is hearts (trump) -- hand effectively holds hearts via the left bower,
    // so playing the off-suit club is illegal.
    const hand = [c('diamonds', 'J'), c('clubs', '9')]
    expect(isLegalPlay(c('clubs', '9'), hand, 'hearts', 'hearts')).toBe(false)
  })

  it('does not count the left bower as its native suit for following that suit', () => {
    // trump = hearts; left bower is J of diamonds, so it no longer counts as a diamond.
    // If diamonds is led and the hand's only "diamond" is the left bower, hand is void in diamonds.
    const hand = [c('diamonds', 'J'), c('clubs', '9')]
    expect(isLegalPlay(c('clubs', '9'), hand, 'diamonds', 'hearts')).toBe(true)
    expect(isLegalPlay(c('diamonds', 'J'), hand, 'diamonds', 'hearts')).toBe(true) // still legal, just not required
  })
})
