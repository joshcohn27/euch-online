import type { Suit } from '../../engine/types.ts'

const SUIT_SYMBOLS: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
}

const RED_SUITS: Suit[] = ['hearts', 'diamonds']

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit]
}

export function suitColor(suit: Suit): string {
  return RED_SUITS.includes(suit) ? '#C0392B' : '#1a1a1a'
}

export function suitLabel(suit: Suit): string {
  return suit.charAt(0).toUpperCase() + suit.slice(1)
}
