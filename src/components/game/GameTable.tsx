import type { Card, Seat, Suit } from '../../engine/types.ts'
import { getEffectiveSuit } from '../../engine/trumpRules.ts'
import PlayingCard from './PlayingCard.tsx'
import { suitLabel, suitSymbol } from './suitDisplay.ts'
import styles from './GameTable.module.css'

export interface GameSeat {
  seat: Seat
  name: string
  initials: string
  isYou: boolean
  isDealer: boolean
  hasPassed: boolean
  connected: boolean
}

export interface TrickCard {
  seat: Seat
  card: Card | null
}

export interface GameTableProps {
  seats: GameSeat[]
  trick: TrickCard[]
  trumpSuit?: Suit | null
  score: { us: number; them: number }
  hand: Card[]
}

function findSeat(seats: GameSeat[], seatNum: Seat): GameSeat | undefined {
  return seats.find((s) => s.seat === seatNum)
}

function findTrickCard(trick: TrickCard[], seatNum: Seat): Card | null {
  return trick.find((t) => t.seat === seatNum)?.card ?? null
}

function SeatBadges({ seat }: { seat: GameSeat }) {
  return (
    <div className={styles.badgeRow}>
      {seat.isDealer && <span className={styles.pill}>Dealer</span>}
      {seat.hasPassed && <span className={styles.pill}>Passed</span>}
      {!seat.connected && <span className={styles.pill}>Offline</span>}
    </div>
  )
}

function SeatMarker({ seat }: { seat: GameSeat }) {
  return (
    <div className={`${styles.seatMarker} ${!seat.connected ? styles.disconnected : ''}`}>
      <div className={styles.avatar}>{seat.initials}</div>
      <div className={styles.seatName}>{seat.name}</div>
      <SeatBadges seat={seat} />
    </div>
  )
}

function TrickSlot({ card, isTrump }: { card: Card | null; isTrump: boolean }) {
  if (!card) {
    return <div className={styles.trickSlotEmpty} />
  }
  return <PlayingCard card={card} size="small" isTrump={isTrump} />
}

export default function GameTable({ seats, trick, trumpSuit, score, hand }: GameTableProps) {
  const you = seats.find((s) => s.isYou)
  const youSeatNum = you?.seat ?? 0
  const partner = findSeat(seats, ((youSeatNum + 2) % 4) as Seat)
  const left = findSeat(seats, ((youSeatNum + 1) % 4) as Seat)
  const right = findSeat(seats, ((youSeatNum + 3) % 4) as Seat)

  const isTrump = (card: Card) => Boolean(trumpSuit) && getEffectiveSuit(card, trumpSuit as Suit) === trumpSuit

  return (
    <div className={styles.wrapper}>
      <div className={styles.felt}>
        {trumpSuit && (
          <div className={styles.trumpBadge}>
            <span className={styles.trumpSymbol}>{suitSymbol(trumpSuit)}</span>
            Trump: {suitLabel(trumpSuit)}
          </div>
        )}

        <div className={styles.scoreRow}>
          <span className={styles.pill}>Us {score.us}</span>
          <span className={styles.pill}>Them {score.them}</span>
        </div>

        {partner && (
          <div className={styles.partnerSeat}>
            <SeatMarker seat={partner} />
          </div>
        )}

        {left && (
          <div className={styles.leftSeat}>
            <SeatMarker seat={left} />
          </div>
        )}

        {right && (
          <div className={styles.rightSeat}>
            <SeatMarker seat={right} />
          </div>
        )}

        <div className={styles.trickArea}>
          {(
            [
              { className: styles.trickTop, seat: partner },
              { className: styles.trickLeft, seat: left },
              { className: styles.trickRight, seat: right },
              { className: styles.trickBottom, seat: you },
            ] as const
          ).map(({ className, seat }, index) => {
            const card = seat ? findTrickCard(trick, seat.seat) : null
            return (
              <div className={className} key={index}>
                <TrickSlot card={card} isTrump={card ? isTrump(card) : false} />
              </div>
            )
          })}
        </div>
      </div>

      {you && (
        <div className={styles.youRow}>
          <div className={styles.youMarker}>
            <div className={styles.avatar}>{you.initials}</div>
            <div className={styles.seatName}>{you.name} (You)</div>
            <SeatBadges seat={you} />
          </div>
        </div>
      )}

      <div className={styles.hand}>
        {hand.map((card, index) => {
          const offset = index - (hand.length - 1) / 2
          return (
            <div
              key={`${card.suit}-${card.rank}`}
              className={styles.handCard}
              style={{ transform: `rotate(${offset * 6}deg) translateY(${Math.abs(offset) * 6}px)` }}
            >
              <PlayingCard card={card} size="large" isTrump={isTrump(card)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
