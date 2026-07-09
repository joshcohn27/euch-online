import type { ReactNode } from 'react'
import type { Card, Seat, Suit } from '../../engine/types.ts'
import { getEffectiveSuit } from '../../engine/trumpRules.ts'
import { sortHand } from './handSort.ts'
import PlayingCard from './PlayingCard.tsx'
import { suitColor, suitSymbol } from './suitDisplay.ts'
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
  status: string
  turnedUpCard?: Card | null
  turnedUpCardFaceDown?: boolean
  tricksWonBySeat?: Partial<Record<Seat, number>>
  showLeadPrompt?: boolean
  centerContent?: ReactNode
  onCardClick?: (card: Card) => void
  selectedCard?: Card | null
}

function findSeat(seats: GameSeat[], seatNum: Seat): GameSeat | undefined {
  return seats.find((s) => s.seat === seatNum)
}

function findTrickCard(trick: TrickCard[], seatNum: Seat): Card | null {
  return trick.find((t) => t.seat === seatNum)?.card ?? null
}

function withTrickCount(name: string, trickCount: number | null): string {
  return trickCount !== null ? `${name} • ${trickCount}` : name
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

function TrumpIndicator({ suit }: { suit: Suit }) {
  return (
    <div className={styles.trumpIndicator}>
      <span className={styles.trumpIndicatorSymbol} style={{ color: suitColor(suit) }}>
        {suitSymbol(suit)}
      </span>
    </div>
  )
}

function TrickSlot({ card, isTrump }: { card: Card | null; isTrump: boolean }) {
  if (!card) {
    return <div className={styles.trickSlotEmpty} />
  }
  return <PlayingCard card={card} size="small" isTrump={isTrump} />
}

export default function GameTable({
  seats,
  trick,
  trumpSuit,
  score,
  hand,
  status,
  turnedUpCard,
  turnedUpCardFaceDown,
  tricksWonBySeat,
  showLeadPrompt,
  centerContent,
  onCardClick,
  selectedCard,
}: GameTableProps) {
  const you = seats.find((s) => s.isYou)
  const youSeatNum = you?.seat ?? 0
  const partner = findSeat(seats, ((youSeatNum + 2) % 4) as Seat)
  const left = findSeat(seats, ((youSeatNum + 1) % 4) as Seat)
  const right = findSeat(seats, ((youSeatNum + 3) % 4) as Seat)

  const isTrump = (card: Card) => Boolean(trumpSuit) && getEffectiveSuit(card, trumpSuit as Suit) === trumpSuit

  const trickCountFor = (seat: Seat): number | null => (status === 'playing' ? (tricksWonBySeat?.[seat] ?? 0) : null)

  // The turned-up card lives next to the dealer's seat while it's still live in round 1/2, then
  // gives way to a plain suit indicator once trump is settled -- there's no specific card to show
  // once a suit was called in round 2 instead of the up-card being picked up.
  const dealerCardFor = (isDealer: boolean): ReactNode => {
    if (!isDealer) return null
    if (status === 'bidding' && turnedUpCard) {
      return <PlayingCard card={turnedUpCard} size="small" faceDown={turnedUpCardFaceDown} />
    }
    if (trumpSuit) {
      return <TrumpIndicator suit={trumpSuit} />
    }
    return null
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.felt}>
        <div className={styles.scoreRow}>
          <span className={styles.scoreLine}>Us: {score.us}</span>
          <span className={styles.scoreLine}>Them: {score.them}</span>
        </div>

        {partner && (
          <div className={`${styles.partnerSeat} ${!partner.connected ? styles.disconnected : ''}`}>
            {dealerCardFor(partner.isDealer)}
            <div className={styles.opponentName}>{withTrickCount(partner.name, trickCountFor(partner.seat))}</div>
            <SeatBadges seat={partner} />
          </div>
        )}

        {left && (
          <div className={`${styles.leftSeat} ${!left.connected ? styles.disconnected : ''}`}>
            <div className={styles.sideRow}>
              {dealerCardFor(left.isDealer)}
              <div className={styles.opponentNameVertical}>{withTrickCount(left.name, trickCountFor(left.seat))}</div>
            </div>
            <SeatBadges seat={left} />
          </div>
        )}

        {right && (
          <div className={`${styles.rightSeat} ${!right.connected ? styles.disconnected : ''}`}>
            <div className={styles.sideRow}>
              <div className={styles.opponentNameVertical}>{withTrickCount(right.name, trickCountFor(right.seat))}</div>
              {dealerCardFor(right.isDealer)}
            </div>
            <SeatBadges seat={right} />
          </div>
        )}

        {status === 'playing' && (
          <div className={styles.trickArea}>
            {showLeadPrompt ? (
              <div className={styles.leadPrompt}>Your turn to lead</div>
            ) : (
              (
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
              })
            )}
          </div>
        )}

        {centerContent && <div className={styles.centerOverlay}>{centerContent}</div>}
      </div>

      {you && (
        <div className={styles.youRow}>
          <div className={styles.youMarker}>
            <div className={styles.avatar}>{you.initials}</div>
            <div className={styles.seatName}>{withTrickCount(`${you.name} (You)`, trickCountFor(you.seat))}</div>
            <SeatBadges seat={you} />
            {dealerCardFor(you.isDealer)}
          </div>
        </div>
      )}

      <div className={styles.hand}>
        {sortHand(hand, trumpSuit ?? null).map((card, index) => {
          const offset = index - (hand.length - 1) / 2
          return (
            <div
              key={`${card.suit}-${card.rank}`}
              className={styles.handCard}
              style={{ transform: `rotate(${offset * 6}deg) translateY(${Math.abs(offset) * 6}px)` }}
            >
              <PlayingCard
                card={card}
                size="large"
                isTrump={isTrump(card)}
                selected={selectedCard != null && selectedCard.suit === card.suit && selectedCard.rank === card.rank}
                onClick={onCardClick ? () => onCardClick(card) : undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
