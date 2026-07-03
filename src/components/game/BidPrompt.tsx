import { useState } from 'react'
import type { Suit } from '../../engine/types.ts'
import { suitColor, suitLabel, suitSymbol } from './suitDisplay.ts'
import styles from './BidPrompt.module.css'

interface BidPromptRound1Props {
  round: 1
  turnedUpSuit: Suit
  onOrderUp?: (alone: boolean) => void
  onPass?: () => void
}

interface BidPromptRound2Props {
  round: 2
  legalSuits: Suit[]
  onCallSuit?: (suit: Suit, alone: boolean) => void
  onPass?: () => void
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
        >
          <span className={styles.switchKnob} />
        </button>
      </div>

      <div className={styles.buttonRow}>
        {props.round === 1 ? (
          <button type="button" className={styles.primaryButton} onClick={() => props.onOrderUp?.(alone)}>
            Order Up
          </button>
        ) : (
          props.legalSuits.map((suit) => (
            <button
              key={suit}
              type="button"
              className={styles.primaryButton}
              onClick={() => props.onCallSuit?.(suit, alone)}
            >
              <span style={{ color: suitColor(suit) }}>{suitSymbol(suit)}</span> Call {suitLabel(suit)}
            </button>
          ))
        )}

        <button type="button" className={styles.secondaryButton} onClick={() => props.onPass?.()}>
          Pass
        </button>
      </div>
    </div>
  )
}
