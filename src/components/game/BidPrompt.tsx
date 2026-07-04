import { useState } from 'react'
import type { Suit } from '../../engine/types.ts'
import { suitColor, suitLabel, suitSymbol } from './suitDisplay.ts'
import styles from './BidPrompt.module.css'

interface BidPromptRound1Props {
  round: 1
  turnedUpSuit: Suit
  // The dealer can never order themselves up in round 1 -- a fixed rule, not derived game state.
  isDealer?: boolean
  onOrderUp?: (alone: boolean) => void
  onPass?: () => void
  disabled?: boolean
}

interface BidPromptRound2Props {
  round: 2
  legalSuits: Suit[]
  onCallSuit?: (suit: Suit, alone: boolean) => void
  onPass?: () => void
  disabled?: boolean
}

type BidPromptProps = BidPromptRound1Props | BidPromptRound2Props

export default function BidPrompt(props: BidPromptProps) {
  const [alone, setAlone] = useState(false)

  return (
    <div className={styles.panel}>
      <div className={styles.label}>Your turn to bid</div>

      {props.round === 1 ? (
        <div className={styles.turnedUpLine}>
          Dealer turned up{' '}
          <span style={{ color: suitColor(props.turnedUpSuit) }}>
            {suitSymbol(props.turnedUpSuit)} {suitLabel(props.turnedUpSuit)}
          </span>
        </div>
      ) : (
        <div className={styles.turnedUpLine}>Call a trump suit, or pass</div>
      )}

      <div className={styles.aloneRow}>
        <span className={styles.aloneLabel}>Go alone</span>
        <button
          type="button"
          role="switch"
          aria-checked={alone}
          className={`${styles.switchTrack} ${alone ? styles.switchOn : ''}`}
          onClick={() => setAlone((a) => !a)}
          disabled={props.disabled}
        >
          <span className={styles.switchKnob} />
        </button>
      </div>

      <div className={styles.buttonRow}>
        {props.round === 1 ? (
          !props.isDealer && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => props.onOrderUp?.(alone)}
              disabled={props.disabled}
            >
              Order Up
            </button>
          )
        ) : (
          props.legalSuits.map((suit) => (
            <button
              key={suit}
              type="button"
              className={styles.primaryButton}
              onClick={() => props.onCallSuit?.(suit, alone)}
              disabled={props.disabled}
            >
              <span style={{ color: suitColor(suit) }}>{suitSymbol(suit)}</span> Call {suitLabel(suit)}
            </button>
          ))
        )}

        <button type="button" className={styles.secondaryButton} onClick={() => props.onPass?.()} disabled={props.disabled}>
          Pass
        </button>
      </div>
    </div>
  )
}
