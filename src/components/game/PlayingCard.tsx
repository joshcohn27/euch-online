import type { Card } from '../../engine/types.ts'
import { suitColor, suitSymbol } from './suitDisplay.ts'
import styles from './PlayingCard.module.css'

export type PlayingCardSize = 'small' | 'large'

interface PlayingCardProps {
  card?: Card
  size?: PlayingCardSize
  isTrump?: boolean
  faceDown?: boolean
}

export default function PlayingCard({ card, size = 'small', isTrump = false, faceDown = false }: PlayingCardProps) {
  const sizeClass = size === 'large' ? styles.large : styles.small

  if (faceDown || !card) {
    return (
      <div className={`${styles.card} ${sizeClass} ${styles.faceDown}`} aria-hidden="true">
        <div className={styles.faceDownFrame} />
      </div>
    )
  }

  const color = suitColor(card.suit)
  const symbol = suitSymbol(card.suit)

  return (
    <div
      className={`${styles.card} ${sizeClass} ${isTrump ? styles.trump : ''}`}
      style={{ color }}
    >
      <div className={styles.cornerTopLeft}>
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.cornerSuit}>{symbol}</span>
      </div>
      <div className={styles.center}>{symbol}</div>
      <div className={styles.cornerBottomRight}>
        <span className={styles.rank}>{card.rank}</span>
        <span className={styles.cornerSuit}>{symbol}</span>
      </div>
    </div>
  )
}
