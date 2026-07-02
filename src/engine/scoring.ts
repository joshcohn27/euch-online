import type { GameRules, HandState, Team } from './types'

export type HandScore = Record<Team, number>

const WINNING_SCORE = 10

function otherTeam(team: Team): Team {
  return team === 0 ? 1 : 0
}

/**
 * Points awarded per team for a completed hand:
 * - march/sweep (maker team takes all 5 tricks): 2 points, or 4 if the maker went alone
 * - make it (maker team takes 3 or 4 tricks): 1 point
 * - euchre (maker team takes fewer than 3 tricks): 2 points to the defending team
 */
export function scoreHand(handState: HandState): HandScore {
  if (handState.makerTeam === null) {
    throw new Error('Cannot score a hand with no maker')
  }

  const makerTeam = handState.makerTeam
  const defendingTeam = otherTeam(makerTeam)
  const makerTricks = handState.tricksWon[makerTeam]

  const score: HandScore = { 0: 0, 1: 0 }

  if (makerTricks === 5) {
    score[makerTeam] = handState.wentAlone ? 4 : 2
  } else if (makerTricks >= 3) {
    score[makerTeam] = 1
  } else {
    score[defendingTeam] = 2
  }

  return score
}

export interface GameOverResult {
  over: boolean
  winner: Team | null
}

/** Checks the standard first-to-10 win condition, plus a win-by-two margin requirement if enabled. */
export function isGameOver(scores: Record<Team, number>, rules: GameRules): GameOverResult {
  const teams: Team[] = [0, 1]

  for (const team of teams) {
    const opponent = otherTeam(team)
    if (scores[team] >= WINNING_SCORE) {
      if (!rules.winByTwo || scores[team] - scores[opponent] >= 2) {
        return { over: true, winner: team }
      }
    }
  }

  return { over: false, winner: null }
}
