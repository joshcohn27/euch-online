import { describe, expect, it } from 'vitest'
import {
  applyStickTheDealer,
  bidOrderForRound,
  isValidRound2Suit,
  processRound1,
  processRound2,
} from './bidding.ts'
import { c } from './testUtils.ts'
import type { BidAction } from './bidding.ts'
import type { GameRules } from './types.ts'

const turnedUp = c('hearts', 'Q')
const noStick: GameRules = { stickTheDealer: false, winByTwo: false, throwDowns: true }
const withStick: GameRules = { stickTheDealer: true, winByTwo: false, throwDowns: true }

describe('bidOrderForRound', () => {
  it('starts left of the dealer and ends with the dealer', () => {
    expect(bidOrderForRound(0)).toEqual([1, 2, 3, 0])
    expect(bidOrderForRound(2)).toEqual([3, 0, 1, 2])
  })
})

describe('processRound1', () => {
  it('the first order_up wins, with correct maker/team/trump/alone', () => {
    const actions: BidAction[] = [
      { seat: 1, type: 'pass' },
      { seat: 2, type: 'order_up', alone: false },
      { seat: 3, type: 'pass' },
    ]
    expect(processRound1(actions, turnedUp)).toEqual({
      called: true,
      maker: 2,
      makerTeam: 0,
      trumpSuit: 'hearts',
      alone: false,
      round: 1,
    })
  })

  it('supports going alone', () => {
    const actions: BidAction[] = [{ seat: 1, type: 'order_up', alone: true }]
    const outcome = processRound1(actions, turnedUp)
    expect(outcome.called).toBe(true)
    expect(outcome.alone).toBe(true)
    expect(outcome.maker).toBe(1)
    expect(outcome.makerTeam).toBe(1)
  })

  it('returns not-called if everyone passes', () => {
    const actions: BidAction[] = [
      { seat: 1, type: 'pass' },
      { seat: 2, type: 'pass' },
      { seat: 3, type: 'pass' },
      { seat: 0, type: 'pass' },
    ]
    expect(processRound1(actions, turnedUp)).toEqual({
      called: false,
      maker: null,
      makerTeam: null,
      trumpSuit: null,
      alone: false,
      round: null,
    })
  })

  it('rejects a call action in round 1', () => {
    const actions: BidAction[] = [{ seat: 1, type: 'call', suit: 'spades', alone: false }]
    expect(() => processRound1(actions, turnedUp)).toThrow()
  })
})

describe('isValidRound2Suit', () => {
  it('rejects the turned-up suit', () => {
    expect(isValidRound2Suit('hearts', turnedUp)).toBe(false)
  })

  it('accepts any other suit', () => {
    expect(isValidRound2Suit('spades', turnedUp)).toBe(true)
    expect(isValidRound2Suit('clubs', turnedUp)).toBe(true)
    expect(isValidRound2Suit('diamonds', turnedUp)).toBe(true)
  })
})

describe('applyStickTheDealer', () => {
  it('forces a call only in round 2, with the rule on, once all others have passed', () => {
    expect(applyStickTheDealer(withStick, 2, 0, true)).toBe(true)
  })

  it('does not force a call in round 1 even with the rule on', () => {
    expect(applyStickTheDealer(withStick, 1, 0, true)).toBe(false)
  })

  it('does not force a call if the rule is off', () => {
    expect(applyStickTheDealer(noStick, 2, 0, true)).toBe(false)
  })

  it('does not force a call if not everyone else has passed yet', () => {
    expect(applyStickTheDealer(withStick, 2, 0, false)).toBe(false)
  })
})

describe('processRound2', () => {
  it('a call after some passes returns the correct outcome', () => {
    const actions: BidAction[] = [
      { seat: 1, type: 'pass' },
      { seat: 2, type: 'call', suit: 'clubs', alone: false },
    ]
    expect(processRound2(actions, turnedUp, noStick, 0)).toEqual({
      called: true,
      maker: 2,
      makerTeam: 0,
      trumpSuit: 'clubs',
      alone: false,
      round: 2,
    })
  })

  it('supports going alone', () => {
    const actions: BidAction[] = [{ seat: 3, type: 'call', suit: 'spades', alone: true }]
    const outcome = processRound2(actions, turnedUp, noStick, 0)
    expect(outcome.alone).toBe(true)
  })

  it('rejects calling the turned-up suit', () => {
    const actions: BidAction[] = [{ seat: 1, type: 'call', suit: 'hearts', alone: false }]
    expect(() => processRound2(actions, turnedUp, noStick, 0)).toThrow()
  })

  it('rejects an order_up action in round 2', () => {
    const actions: BidAction[] = [{ seat: 1, type: 'order_up', alone: false }]
    expect(() => processRound2(actions, turnedUp, noStick, 0)).toThrow()
  })

  it('returns not-called if everyone passes and stick-the-dealer is off', () => {
    const actions: BidAction[] = [
      { seat: 1, type: 'pass' },
      { seat: 2, type: 'pass' },
      { seat: 3, type: 'pass' },
      { seat: 0, type: 'pass' },
    ]
    expect(processRound2(actions, turnedUp, noStick, 0).called).toBe(false)
  })

  it('rejects the dealer passing when stick-the-dealer forces a call', () => {
    const actions: BidAction[] = [
      { seat: 1, type: 'pass' },
      { seat: 2, type: 'pass' },
      { seat: 3, type: 'pass' },
      { seat: 0, type: 'pass' }, // dealer, all others passed, stick-the-dealer on
    ]
    expect(() => processRound2(actions, turnedUp, withStick, 0)).toThrow()
  })

  it('allows the dealer to call under stick-the-dealer instead of passing', () => {
    const actions: BidAction[] = [
      { seat: 1, type: 'pass' },
      { seat: 2, type: 'pass' },
      { seat: 3, type: 'pass' },
      { seat: 0, type: 'call', suit: 'diamonds', alone: false },
    ]
    const outcome = processRound2(actions, turnedUp, withStick, 0)
    expect(outcome).toEqual({
      called: true,
      maker: 0,
      makerTeam: 0,
      trumpSuit: 'diamonds',
      alone: false,
      round: 2,
    })
  })

  it('does not force the dealer to call if someone else already called', () => {
    const actions: BidAction[] = [
      { seat: 1, type: 'pass' },
      { seat: 2, type: 'call', suit: 'spades', alone: false },
      { seat: 3, type: 'pass' },
      { seat: 0, type: 'pass' },
    ]
    // the round resolves on seat 2's call and never reaches the dealer's forced-call check
    expect(processRound2(actions, turnedUp, withStick, 0).maker).toBe(2)
  })
})
