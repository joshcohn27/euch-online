import { describe, expect, it } from 'vitest'
import { isGameOver, scoreHand } from './scoring.ts'
import { emptyHandState } from './testUtils.ts'
import type { GameRules } from './types.ts'

const rules: GameRules = { stickTheDealer: true, winByTwo: false, throwDowns: true }

describe('scoreHand', () => {
  it('awards 2 points for a march (5 tricks), not alone', () => {
    const hand = emptyHandState({ makerTeam: 0, wentAlone: false, tricksWon: { 0: 5, 1: 0 } })
    expect(scoreHand(hand)).toEqual({ 0: 2, 1: 0 })
  })

  it('awards 4 points for a lone march (5 tricks, went alone)', () => {
    const hand = emptyHandState({ makerTeam: 1, wentAlone: true, tricksWon: { 0: 0, 1: 5 } })
    expect(scoreHand(hand)).toEqual({ 0: 0, 1: 4 })
  })

  it('awards 1 point for making it with 3 tricks', () => {
    const hand = emptyHandState({ makerTeam: 0, wentAlone: false, tricksWon: { 0: 3, 1: 2 } })
    expect(scoreHand(hand)).toEqual({ 0: 1, 1: 0 })
  })

  it('awards 1 point for making it with 4 tricks', () => {
    const hand = emptyHandState({ makerTeam: 0, wentAlone: false, tricksWon: { 0: 4, 1: 1 } })
    expect(scoreHand(hand)).toEqual({ 0: 1, 1: 0 })
  })

  it('awards 1 point for making it alone with 4 tricks (not a sweep, so no lone bonus)', () => {
    const hand = emptyHandState({ makerTeam: 0, wentAlone: true, tricksWon: { 0: 4, 1: 1 } })
    expect(scoreHand(hand)).toEqual({ 0: 1, 1: 0 })
  })

  it('awards 2 points to defenders on a euchre (maker takes 2 tricks)', () => {
    const hand = emptyHandState({ makerTeam: 0, wentAlone: false, tricksWon: { 0: 2, 1: 3 } })
    expect(scoreHand(hand)).toEqual({ 0: 0, 1: 2 })
  })

  it('awards 2 points to defenders on a euchre (maker takes 0 tricks)', () => {
    const hand = emptyHandState({ makerTeam: 1, wentAlone: false, tricksWon: { 0: 5, 1: 0 } })
    expect(scoreHand(hand)).toEqual({ 0: 2, 1: 0 })
  })

  it('throws if there is no maker', () => {
    const hand = emptyHandState({ makerTeam: null })
    expect(() => scoreHand(hand)).toThrow()
  })
})

describe('isGameOver', () => {
  it('is not over below 10 points', () => {
    expect(isGameOver({ 0: 9, 1: 8 }, rules)).toEqual({ over: false, winner: null })
  })

  it('is over once a team reaches 10, without winByTwo', () => {
    expect(isGameOver({ 0: 10, 1: 8 }, rules)).toEqual({ over: true, winner: 0 })
  })

  it('with winByTwo, reaching 10 with only a 1-point lead is not enough', () => {
    const winByTwoRules: GameRules = { ...rules, winByTwo: true }
    expect(isGameOver({ 0: 10, 1: 9 }, winByTwoRules)).toEqual({ over: false, winner: null })
  })

  it('with winByTwo, a 2+ point lead at 10+ wins', () => {
    const winByTwoRules: GameRules = { ...rules, winByTwo: true }
    expect(isGameOver({ 0: 11, 1: 9 }, winByTwoRules)).toEqual({ over: true, winner: 0 })
  })

  it('with winByTwo, the game can extend past 10 until a 2-point margin appears', () => {
    const winByTwoRules: GameRules = { ...rules, winByTwo: true }
    expect(isGameOver({ 0: 12, 1: 11 }, winByTwoRules)).toEqual({ over: false, winner: null })
    expect(isGameOver({ 0: 13, 1: 11 }, winByTwoRules)).toEqual({ over: true, winner: 0 })
  })
})
