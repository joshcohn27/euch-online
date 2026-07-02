import type { Card, HandState, Rank, Seat, Suit } from './types'

export function c(suit: Suit, rank: Rank): Card {
  return { suit, rank }
}

export function emptyHandState(overrides: Partial<HandState> = {}): HandState {
  return {
    dealer: 0,
    hands: { 0: [], 1: [], 2: [], 3: [] },
    kitty: [],
    turnedUpCard: c('clubs', '9'),
    trumpSuit: null,
    maker: null,
    makerTeam: null,
    wentAlone: false,
    currentTrickNumber: 1,
    tricksWon: { 0: 0, 1: 0 },
    ...overrides,
  }
}

export function seats(cards: Record<Seat, Card[]>): Record<Seat, Card[]> {
  return cards
}
