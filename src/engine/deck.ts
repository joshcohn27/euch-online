import type { Card, Seat, Suit, Rank } from './types'

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']
const RANKS: Rank[] = ['9', '10', 'J', 'Q', 'K', 'A']

export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank })
    }
  }
  return deck
}

export function shuffleDeck(deck: Card[], rng: () => number = Math.random): Card[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export interface DealResult {
  hands: Record<Seat, Card[]>
  kitty: Card[]
  turnedUpCard: Card
}

const SEATS: Seat[] = [0, 1, 2, 3]

export function dealHand(deck: Card[]): DealResult {
  if (deck.length !== 24) {
    throw new Error(`dealHand requires a 24-card deck, got ${deck.length}`)
  }

  const hands = { 0: [], 1: [], 2: [], 3: [] } as Record<Seat, Card[]>

  let cursor = 0
  for (const seat of SEATS) {
    hands[seat] = deck.slice(cursor, cursor + 5)
    cursor += 5
  }

  const kitty = deck.slice(cursor, cursor + 4)
  const turnedUpCard = kitty[0]

  return { hands, kitty, turnedUpCard }
}
