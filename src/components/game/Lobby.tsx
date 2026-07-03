import { useState } from 'react'
import type { Seat } from '../../engine/types.ts'
import styles from './Lobby.module.css'

export interface LobbySeat {
  seat: Seat
  filled: boolean
  name?: string
  initials?: string
  isDealer?: boolean
}

export interface LobbyProps {
  joinCode: string
  houseRulesSummary: string
  seats: LobbySeat[]
  onStart?: () => void
  onCopyJoinCode?: () => void
}

export default function Lobby({ joinCode, houseRulesSummary, seats, onStart, onCopyJoinCode }: LobbyProps) {
  const [copied, setCopied] = useState(false)
  const filledCount = seats.filter((s) => s.filled).length
  const allFilled = filledCount === 4

  const handleCopy = async () => {
    onCopyJoinCode?.()
    try {
      await navigator.clipboard.writeText(joinCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard access unavailable, ignore
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Lobby</h1>

        <div className={styles.joinCodeRow}>
          <span className={styles.joinCodeLabel}>Join code</span>
          <span className={styles.joinCode}>{joinCode}</span>
          <button type="button" className={styles.copyButton} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className={styles.rulesSummary}>{houseRulesSummary}</div>

        <div className={styles.seatGrid}>
          {seats.map((seat) => (
            <div key={seat.seat} className={seat.filled ? styles.seatCard : styles.seatCardEmpty}>
              {seat.filled ? (
                <>
                  <div className={styles.avatar}>{seat.initials}</div>
                  <div className={styles.seatName}>{seat.name}</div>
                  <div className={styles.badgeRow}>
                    <span className={styles.pill}>Seat {seat.seat + 1}</span>
                    {seat.isDealer && <span className={styles.pill}>Dealer</span>}
                  </div>
                </>
              ) : (
                <div className={styles.waitingLabel}>Waiting for player</div>
              )}
            </div>
          ))}
        </div>

        <button type="button" className={styles.startButton} disabled={!allFilled} onClick={onStart}>
          {allFilled ? 'Start Game' : `Waiting for 4 players • ${filledCount}/4`}
        </button>
      </div>
    </div>
  )
}
