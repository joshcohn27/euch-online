import { describe, expect, it } from 'vitest'
import { buildDeck, dealHand, shuffleDeck } from './deck'

describe('buildDeck', () => {
  it('builds 24 unique cards, 6 ranks across 4 suits', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(24)

    const keys = new Set(deck.map((c) => `${c.suit}:${c.rank}`))
    expect(keys.size).toBe(24)

    const suitCounts = new Map<string, number>()
    for (const card of deck) {
      suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1)
    }
    expect([...suitCounts.values()]).toEqual([6, 6, 6, 6])
  })
})

describe('shuffleDeck', () => {
  it('does not mutate the input array', () => {
    const deck = buildDeck()
    const original = [...deck]
    shuffleDeck(deck, () => 0.5)
    expect(deck).toEqual(original)
  })

  it('preserves the same set of cards, just reordered', () => {
    const deck = buildDeck()
    const shuffled = shuffleDeck(deck, () => 0.5)

    expect(shuffled).toHaveLength(24)
    const originalKeys = new Set(deck.map((c) => `${c.suit}:${c.rank}`))
    const shuffledKeys = new Set(shuffled.map((c) => `${c.suit}:${c.rank}`))
    expect(shuffledKeys).toEqual(originalKeys)
  })

  it('is deterministic for a given rng', () => {
    const deck = buildDeck()
    let calls = 0
    const rng = () => {
      calls += 1
      return (calls * 37) % 100 / 100
    }
    const a = shuffleDeck(deck, rng)

    calls = 0
    const b = shuffleDeck(deck, rng)

    expect(a).toEqual(b)
  })

  it('actually reorders when rng is non-trivial', () => {
    const deck = buildDeck()
    let i = 0
    const values = [0.9, 0.1, 0.8, 0.2, 0.7, 0.3]
    const rng = () => values[i++ % values.length]
    const shuffled = shuffleDeck(deck, rng)
    expect(shuffled).not.toEqual(deck)
  })
})

describe('dealHand', () => {
  it('deals 5 cards to each seat and 4 to the kitty', () => {
    const deck = buildDeck()
    const { hands, kitty, turnedUpCard } = dealHand(deck)

    expect(hands[0]).toHaveLength(5)
    expect(hands[1]).toHaveLength(5)
    expect(hands[2]).toHaveLength(5)
    expect(hands[3]).toHaveLength(5)
    expect(kitty).toHaveLength(4)
    expect(turnedUpCard).toEqual(kitty[0])
  })

  it('accounts for every card exactly once', () => {
    const deck = buildDeck()
    const { hands, kitty } = dealHand(deck)

    const dealt = [...hands[0], ...hands[1], ...hands[2], ...hands[3], ...kitty]
    expect(dealt).toHaveLength(24)

    const keys = new Set(dealt.map((c) => `${c.suit}:${c.rank}`))
    expect(keys.size).toBe(24)
  })

  it('throws if the deck is not exactly 24 cards', () => {
    const deck = buildDeck().slice(0, 23)
    expect(() => dealHand(deck)).toThrow()
  })
})
