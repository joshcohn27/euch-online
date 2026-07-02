import { describe, expect, it } from 'vitest'
import { evaluateThrowdown } from './throwdownEvaluator.ts'
import { c, emptyHandState } from './testUtils.ts'
import type { Card } from './types.ts'

// Common trick_lock / loner_lock fixture: trump = spades, fromSeat holds A-spades, A-diamonds,
// A-hearts. Every trump card besides A-spades has already been played (seen), so fromSeat's
// A-spades is provably the only trump left anywhere -- which simultaneously proves "no opponent
// holds trump" and "holds the top of the live trump suit". The A-diamonds/A-hearts are the
// natural top of their suits regardless of who holds the rest (no bower complicates a non-trump
// suit's ace).
const trumpAccountedExceptAceOfSpades: Card[] = [
  c('spades', 'J'), // right bower
  c('clubs', 'J'), // left bower
  c('spades', '9'),
  c('spades', '10'),
  c('spades', 'Q'),
  c('spades', 'K'),
]

describe('evaluateThrowdown', () => {
  it('is not decided while trump has not been called yet', () => {
    const hand = emptyHandState({ trumpSuit: null, makerTeam: null })
    expect(evaluateThrowdown(hand, [], 0)).toEqual({
      decided: false,
      condition: null,
      projectedWinnerTeam: null,
    })
  })

  it('is not decided early in the hand with nothing known', () => {
    const hand = emptyHandState({
      trumpSuit: 'spades',
      maker: 0,
      makerTeam: 0,
      wentAlone: false,
      tricksWon: { 0: 0, 1: 0 },
      hands: {
        0: [c('clubs', '9'), c('diamonds', '9'), c('hearts', '9'), c('spades', '9'), c('clubs', '10')],
        1: [],
        2: [],
        3: [],
      },
    })
    expect(evaluateThrowdown(hand, [], 0)).toEqual({
      decided: false,
      condition: null,
      projectedWinnerTeam: null,
    })
  })

  describe('count_lock', () => {
    it('triggers as soon as a team reaches 3 tricks, independent of hands', () => {
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        tricksWon: { 0: 3, 1: 1 },
      })
      expect(evaluateThrowdown(hand, [], 2)).toEqual({
        decided: true,
        condition: 'count_lock',
        projectedWinnerTeam: 0,
      })
    })

    it('projects the correct team when the defenders are the ones with 3 tricks', () => {
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        tricksWon: { 0: 1, 1: 3 },
      })
      expect(evaluateThrowdown(hand, [], 0).projectedWinnerTeam).toBe(1)
    })

    it('takes priority over an in-progress trick/loner read', () => {
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        wentAlone: true,
        tricksWon: { 0: 3, 1: 0 },
        hands: { 0: [c('clubs', '9')], 1: [], 2: [], 3: [] },
      })
      expect(evaluateThrowdown(hand, [], 0).condition).toBe('count_lock')
    })
  })

  describe('trick_lock', () => {
    it('triggers when fromSeat holds the top of every live suit and no trump remains unaccounted', () => {
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        wentAlone: false,
        tricksWon: { 0: 1, 1: 1 },
        hands: {
          0: [c('spades', 'A'), c('diamonds', 'A'), c('hearts', 'A')],
          1: [],
          2: [],
          3: [],
        },
      })
      const cardsSeen: Card[] = [
        ...trumpAccountedExceptAceOfSpades,
        c('clubs', '9'),
        c('clubs', '10'),
        c('clubs', 'Q'),
        c('clubs', 'K'),
        c('clubs', 'A'),
      ]

      expect(evaluateThrowdown(hand, cardsSeen, 0)).toEqual({
        decided: true,
        condition: 'trick_lock',
        projectedWinnerTeam: 0,
      })
    })

    it('does not trigger if fromSeat is missing the top of a live suit', () => {
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        wentAlone: false,
        tricksWon: { 0: 1, 1: 1 },
        hands: {
          // King of hearts instead of the ace -- the ace of hearts is still unaccounted for
          0: [c('spades', 'A'), c('diamonds', 'A'), c('hearts', 'K')],
          1: [],
          2: [],
          3: [],
        },
      })
      const cardsSeen: Card[] = [...trumpAccountedExceptAceOfSpades]

      expect(evaluateThrowdown(hand, cardsSeen, 0)).toEqual({
        decided: false,
        condition: null,
        projectedWinnerTeam: null,
      })
    })

    it('does not trigger if a trump card remains unaccounted for, even if fromSeat beats it', () => {
      // fromSeat holds the top of every suit including trump (their lone trump, the ace,
      // outranks the one unaccounted trump card), but that unaccounted 9 of spades could still
      // be sitting in an opponent's hand -- "no opponent holds trump" is a separate requirement.
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        wentAlone: false,
        tricksWon: { 0: 1, 1: 1 },
        hands: {
          0: [c('spades', 'A'), c('diamonds', 'A'), c('hearts', 'A'), c('clubs', 'A')],
          1: [],
          2: [],
          3: [],
        },
      })
      // every trump card seen except the 9 of spades AND the ace of spades (held by fromSeat)
      const cardsSeen: Card[] = [c('spades', 'J'), c('clubs', 'J'), c('spades', '10'), c('spades', 'Q'), c('spades', 'K')]

      expect(evaluateThrowdown(hand, cardsSeen, 0)).toEqual({
        decided: false,
        condition: null,
        projectedWinnerTeam: null,
      })
    })

    it('uses trick_lock (not loner_lock) when the hand was not played alone', () => {
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        wentAlone: false,
        tricksWon: { 0: 1, 1: 1 },
        hands: {
          0: [c('spades', 'A'), c('diamonds', 'A'), c('hearts', 'A')],
          1: [],
          2: [],
          3: [],
        },
      })
      const cardsSeen: Card[] = [
        ...trumpAccountedExceptAceOfSpades,
        c('clubs', '9'),
        c('clubs', '10'),
        c('clubs', 'Q'),
        c('clubs', 'K'),
        c('clubs', 'A'),
      ]

      expect(evaluateThrowdown(hand, cardsSeen, 0).condition).toBe('trick_lock')
    })

    it('projects a defending team win when a defender is the one holding all the locks', () => {
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        wentAlone: false,
        tricksWon: { 0: 1, 1: 1 },
        hands: {
          0: [],
          1: [c('spades', 'A'), c('diamonds', 'A'), c('hearts', 'A')],
          2: [],
          3: [],
        },
      })
      const cardsSeen: Card[] = [
        ...trumpAccountedExceptAceOfSpades,
        c('clubs', '9'),
        c('clubs', '10'),
        c('clubs', 'Q'),
        c('clubs', 'K'),
        c('clubs', 'A'),
      ]

      expect(evaluateThrowdown(hand, cardsSeen, 1)).toEqual({
        decided: true,
        condition: 'trick_lock',
        projectedWinnerTeam: 1,
      })
    })
  })

  describe('loner_lock', () => {
    it('triggers for the lone maker holding all remaining top cards with no trump outstanding', () => {
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        wentAlone: true,
        tricksWon: { 0: 1, 1: 0 },
        hands: {
          0: [c('spades', 'A'), c('diamonds', 'A'), c('hearts', 'A')],
          1: [],
          2: [], // maker's partner, sitting out
          3: [],
        },
      })
      const cardsSeen: Card[] = [
        ...trumpAccountedExceptAceOfSpades,
        c('clubs', '9'),
        c('clubs', '10'),
        c('clubs', 'Q'),
        c('clubs', 'K'),
        c('clubs', 'A'),
      ]

      expect(evaluateThrowdown(hand, cardsSeen, 0)).toEqual({
        decided: true,
        condition: 'loner_lock',
        projectedWinnerTeam: 0,
      })
    })

    it('does not use loner_lock when evaluated from a seat other than the lone maker', () => {
      // Same underlying cards, but the lone maker is seat 0; here we ask on behalf of seat 1
      // (a defender) who happens to hold the exact same locking cards. It should still be
      // decided, but as a generic trick_lock, not a loner_lock (which is maker-only).
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        wentAlone: true,
        tricksWon: { 0: 0, 1: 0 },
        hands: {
          0: [],
          1: [c('spades', 'A'), c('diamonds', 'A'), c('hearts', 'A')],
          2: [],
          3: [],
        },
      })
      const cardsSeen: Card[] = [
        ...trumpAccountedExceptAceOfSpades,
        c('clubs', '9'),
        c('clubs', '10'),
        c('clubs', 'Q'),
        c('clubs', 'K'),
        c('clubs', 'A'),
      ]

      expect(evaluateThrowdown(hand, cardsSeen, 1)).toEqual({
        decided: true,
        condition: 'trick_lock',
        projectedWinnerTeam: 1,
      })
    })

    it('does not trigger loner_lock if the hand was not played alone', () => {
      const hand = emptyHandState({
        trumpSuit: 'spades',
        maker: 0,
        makerTeam: 0,
        wentAlone: false,
        tricksWon: { 0: 1, 1: 1 },
        hands: {
          0: [c('spades', 'A'), c('diamonds', 'A'), c('hearts', 'K')], // missing top card
          1: [],
          2: [],
          3: [],
        },
      })
      expect(evaluateThrowdown(hand, [...trumpAccountedExceptAceOfSpades], 0).condition).not.toBe('loner_lock')
    })
  })
})
