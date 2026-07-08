import { useState } from 'react'
import type { Suit } from '../../engine/types.ts'
import { suitColor, suitLabel, suitSymbol } from './suitDisplay.ts'
import styles from './BidPrompt.module.css'

interface BidPromptRound1Props {
  round: 1
  turnedUpSuit: Suit
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

  if (props.round === 1) {
    return (
      <div className={styles.panel}>
        <div className={styles.label}>Your turn to bid</div>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => props.onOrderUp?.(false)}
            disabled={props.disabled}
          >
            <span style={{ color: suitColor(props.turnedUpSuit) }}>{suitSymbol(props.turnedUpSuit)}</span> Order Up
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => props.onOrderUp?.(true)}
            disabled={props.disabled}
          >
            <span style={{ color: suitColor(props.turnedUpSuit) }}>{suitSymbol(props.turnedUpSuit)}</span> Order Up, Alone
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => props.onPass?.()} disabled={props.disabled}>
            Pass
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.label}>Your turn to bid</div>
      <div className={styles.turnedUpLine}>Call a trump suit, or pass</div>

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
        {props.legalSuits.map((suit) => (
          <button
            key={suit}
            type="button"
            className={styles.primaryButton}
            onClick={() => props.onCallSuit?.(suit, alone)}
            disabled={props.disabled}
          >
            <span style={{ color: suitColor(suit) }}>{suitSymbol(suit)}</span> Call {suitLabel(suit)}
          </button>
        ))}

        <button type="button" className={styles.secondaryButton} onClick={() => props.onPass?.()} disabled={props.disabled}>
          Pass
        </button>
      </div>
    </div>
  )
}
