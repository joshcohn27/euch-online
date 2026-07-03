import styles from './Settlement.module.css'

export interface SettlementRow {
  from: string
  to: string
  amount: number
  bumpTags?: string[]
}

export interface SettlementProps {
  finalScore: { us: number; them: number }
  youWon: boolean
  rows: SettlementRow[]
  onRematch?: () => void
  onLeave?: () => void
}

export default function Settlement({ finalScore, youWon, rows, onRematch, onLeave }: SettlementProps) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={`${styles.winnerBanner} ${youWon ? styles.win : styles.loss}`}>
          {youWon ? 'You win!' : 'You lose'}
        </div>

        <div className={styles.finalScoreRow}>
          <div className={styles.scoreBlock}>
            <span className={styles.scoreValue}>{finalScore.us}</span>
            <span className={styles.scoreLabel}>Us</span>
          </div>
          <span className={styles.scoreDivider}>-</span>
          <div className={styles.scoreBlock}>
            <span className={styles.scoreValue}>{finalScore.them}</span>
            <span className={styles.scoreLabel}>Them</span>
          </div>
        </div>

        <div className={styles.rowsList}>
          {rows.map((row, index) => (
            <div key={index} className={styles.settlementRow}>
              <div className={styles.settlementLine}>
                <span className={styles.settlementNames}>
                  {row.from} owes {row.to}
                </span>
                <span className={styles.settlementAmount}>${row.amount.toFixed(2)}</span>
              </div>
              {row.bumpTags && row.bumpTags.length > 0 && (
                <div className={styles.bumpTagRow}>
                  {row.bumpTags.map((tag) => (
                    <span key={tag} className={styles.bumpTag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.buttonRow}>
          <button type="button" className={styles.primaryButton} onClick={onRematch}>
            Rematch
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onLeave}>
            Leave Table
          </button>
        </div>
      </div>
    </div>
  )
}
