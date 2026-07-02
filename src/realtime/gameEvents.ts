import type { Card, Seat, Suit } from '../engine/types.ts'

export const GAME_EVENT_NAME = 'game_event'

export function gameChannelTopic(gameId: string): string {
  return `game:${gameId}`
}

export type GameEvent =
  | {
      type: 'hand_dealt'
      gameId: string
      handId: string
      handNumber: number
      dealerSeat: Seat
    }
  | {
      type: 'bid_made'
      gameId: string
      handId: string
      seat: Seat
      action: 'pass' | 'order_up' | 'call_suit'
      suit: Suit | null
      alone: boolean
      status: string
      round: 1 | 2 | null
      nextSeat: Seat | null
      called: boolean
      trumpSuit: Suit | null
      makerSeat: Seat | null
    }
  | {
      type: 'card_discarded'
      gameId: string
      handId: string
      seat: Seat
      status: 'playing'
    }
  | {
      type: 'card_played'
      gameId: string
      handId: string
      seat: Seat
      card: Card
      trickNumber: number
      cardsPlayed: { seat: Seat; card: Card }[]
      winnerSeat: Seat | null
    }
