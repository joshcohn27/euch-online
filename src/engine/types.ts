export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades'

export type Rank = '9' | '10' | 'J' | 'Q' | 'K' | 'A'

export interface Card {
  suit: Suit
  rank: Rank
}

export type Seat = 0 | 1 | 2 | 3

export type Team = 0 | 1

export function teamOfSeat(seat: Seat): Team {
  return (seat % 2) as Team
}

export function partnerOfSeat(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat
}

export interface GameRules {
  stickTheDealer: boolean
  winByTwo: boolean
  throwDowns: boolean
}

export interface HandState {
  dealer: Seat
  hands: Record<Seat, Card[]>
  kitty: Card[]
  turnedUpCard: Card
  trumpSuit: Suit | null
  maker: Seat | null
  makerTeam: Team | null
  wentAlone: boolean
  currentTrickNumber: number
  tricksWon: Record<Team, number>
}

export interface PlayedCard {
  seat: Seat
  card: Card
}

export interface TrickState {
  trickNumber: number
  leadSeat: Seat
  cardsPlayed: PlayedCard[]
  winner: Seat | null
}
