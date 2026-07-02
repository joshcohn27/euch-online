import { describe, expect, it } from 'vitest'
import { getCardRank, getEffectiveSuit, isLeftBower, isRightBower } from './trumpRules'
import { c } from './testUtils'

describe('isLeftBower', () => {
  it('is true for the jack of the same color as trump', () => {
    expect(isLeftBower(c('clubs', 'J'), 'spades')).toBe(true)
    expect(isLeftBower(c('hearts', 'J'), 'diamonds')).toBe(true)
  })

  it('is false for the jack of the trump suit itself (that is the right bower)', () => {
    expect(isLeftBower(c('spades', 'J'), 'spades')).toBe(false)
  })

  it('is false for the jack of the opposite color', () => {
    expect(isLeftBower(c('hearts', 'J'), 'spades')).toBe(false)
    expect(isLeftBower(c('diamonds', 'J'), 'clubs')).toBe(false)
  })

  it('is false for non-jack cards', () => {
    expect(isLeftBower(c('clubs', 'A'), 'spades')).toBe(false)
  })
})

describe('isRightBower', () => {
  it('is true only for the jack of the trump suit', () => {
    expect(isRightBower(c('spades', 'J'), 'spades')).toBe(true)
    expect(isRightBower(c('clubs', 'J'), 'spades')).toBe(false)
    expect(isRightBower(c('spades', 'A'), 'spades')).toBe(false)
  })
})

describe('getEffectiveSuit', () => {
  it('maps the left bower to the trump suit', () => {
    expect(getEffectiveSuit(c('clubs', 'J'), 'spades')).toBe('spades')
  })

  it('leaves the right bower as its native (trump) suit', () => {
    expect(getEffectiveSuit(c('spades', 'J'), 'spades')).toBe('spades')
  })

  it('leaves non-bower cards in their native suit', () => {
    expect(getEffectiveSuit(c('hearts', 'A'), 'spades')).toBe('hearts')
    expect(getEffectiveSuit(c('diamonds', 'J'), 'spades')).toBe('diamonds')
  })
})

describe('getCardRank', () => {
  const trump: Parameters<typeof getCardRank>[1] = 'hearts'

  it('ranks the right bower above everything', () => {
    const rightBower = getCardRank(c('hearts', 'J'), trump, 'spades')
    const leftBower = getCardRank(c('diamonds', 'J'), trump, 'spades')
    const aceOfTrump = getCardRank(c('hearts', 'A'), trump, 'spades')
    expect(rightBower).toBeGreaterThan(leftBower)
    expect(rightBower).toBeGreaterThan(aceOfTrump)
  })

  it('ranks the left bower above other trump cards but below the right bower', () => {
    const leftBower = getCardRank(c('diamonds', 'J'), trump, 'spades')
    const aceOfTrump = getCardRank(c('hearts', 'A'), trump, 'spades')
    const rightBower = getCardRank(c('hearts', 'J'), trump, 'spades')
    expect(leftBower).toBeGreaterThan(aceOfTrump)
    expect(leftBower).toBeLessThan(rightBower)
  })

  it('ranks other trump above led-suit non-trump', () => {
    const nineOfTrump = getCardRank(c('hearts', '9'), trump, 'spades')
    const aceOfLed = getCardRank(c('spades', 'A'), trump, 'spades')
    expect(nineOfTrump).toBeGreaterThan(aceOfLed)
  })

  it('ranks led-suit non-trump above off-suit cards', () => {
    const aceOfLed = getCardRank(c('spades', 'A'), trump, 'spades')
    const aceOfOffSuit = getCardRank(c('clubs', 'A'), trump, 'spades')
    expect(aceOfLed).toBeGreaterThan(aceOfOffSuit)
  })

  it('orders plain (non-bower) cards within a suit by face rank', () => {
    const nine = getCardRank(c('spades', '9'), trump, 'spades')
    const ten = getCardRank(c('spades', '10'), trump, 'spades')
    const jack = getCardRank(c('spades', 'J'), trump, 'spades')
    const queen = getCardRank(c('spades', 'Q'), trump, 'spades')
    const king = getCardRank(c('spades', 'K'), trump, 'spades')
    const ace = getCardRank(c('spades', 'A'), trump, 'spades')
    expect(nine).toBeLessThan(ten)
    expect(ten).toBeLessThan(jack)
    expect(jack).toBeLessThan(queen)
    expect(queen).toBeLessThan(king)
    expect(king).toBeLessThan(ace)
  })

  it('treats a jack that is neither bower as a plain card of its native suit', () => {
    // trump = spades (black); jack of hearts (red, opposite color) is not a bower at all
    const jackOfHearts = getCardRank(c('hearts', 'J'), 'spades', 'hearts')
    const tenOfHearts = getCardRank(c('hearts', '10'), 'spades', 'hearts')
    const queenOfHearts = getCardRank(c('hearts', 'Q'), 'spades', 'hearts')
    expect(jackOfHearts).toBeGreaterThan(tenOfHearts)
    expect(jackOfHearts).toBeLessThan(queenOfHearts)
  })
})
