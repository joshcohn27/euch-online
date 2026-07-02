import type { Card, GameRules, Seat, Suit, Team } from './types'
import { teamOfSeat } from './types'

export type BidAction =
  | { seat: Seat; type: 'pass' }
  | { seat: Seat; type: 'order_up'; alone: boolean }
  | { seat: Seat; type: 'call'; suit: Suit; alone: boolean }

export interface BidOutcome {
  called: boolean
  maker: Seat | null
  makerTeam: Team | null
  trumpSuit: Suit | null
  alone: boolean
  round: 1 | 2 | null
}

const NOT_CALLED: BidOutcome = {
  called: false,
  maker: null,
  makerTeam: null,
  trumpSuit: null,
  alone: false,
  round: null,
}

/** Bidding always proceeds starting left of the dealer, with the dealer acting last. */
export function bidOrderForRound(dealerSeat: Seat): Seat[] {
  return [1, 2, 3, 4].map((offset) => ((dealerSeat + offset) % 4) as Seat)
}

export function isValidRound2Suit(suit: Suit, turnedUpCard: Card): boolean {
  return suit !== turnedUpCard.suit
}

/**
 * True if, given the rules and how the round has gone so far, the dealer is forced to
 * call and cannot pass: stick-the-dealer is on, it's round 2, and every other seat has passed.
 */
export function applyStickTheDealer(
  rules: GameRules,
  round: 1 | 2,
  _dealerSeat: Seat,
  allPassed: boolean,
): boolean {
  return rules.stickTheDealer && round === 2 && allPassed
}

/** Processes round 1 (order up the turned-up card, or pass) from an ordered sequence of seat actions. */
export function processRound1(actions: BidAction[], turnedUpCard: Card): BidOutcome {
  for (const action of actions) {
    if (action.type === 'call') {
      throw new Error('Calling a suit is not valid in bid round 1; use order_up or pass')
    }

    if (action.type === 'order_up') {
      return {
        called: true,
        maker: action.seat,
        makerTeam: teamOfSeat(action.seat),
        trumpSuit: turnedUpCard.suit,
        alone: action.alone,
        round: 1,
      }
    }
  }

  return NOT_CALLED
}

/** Processes round 2 (call any suit but the turned-up suit, or pass), enforcing stick-the-dealer. */
export function processRound2(
  actions: BidAction[],
  turnedUpCard: Card,
  rules: GameRules,
  dealerSeat: Seat,
): BidOutcome {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const isDealersTurn = action.seat === dealerSeat
    const allPassedSoFar = actions.slice(0, i).every((a) => a.type === 'pass')
    const dealerMustCall = isDealersTurn && applyStickTheDealer(rules, 2, dealerSeat, allPassedSoFar)

    if (action.type === 'order_up') {
      throw new Error('Ordering up is not valid in bid round 2; use call or pass')
    }

    if (action.type === 'pass') {
      if (dealerMustCall) {
        throw new Error('Dealer cannot pass in round 2: stick-the-dealer forces a call')
      }
      continue
    }

    // action.type === 'call'
    if (!isValidRound2Suit(action.suit, turnedUpCard)) {
      throw new Error('Cannot call the turned-up suit in bid round 2')
    }

    return {
      called: true,
      maker: action.seat,
      makerTeam: teamOfSeat(action.seat),
      trumpSuit: action.suit,
      alone: action.alone,
      round: 2,
    }
  }

  return NOT_CALLED
}
