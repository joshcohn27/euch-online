import type { ReactNode } from 'react'
import type { Card } from '../engine/types.ts'
import PlayingCard from '../components/game/PlayingCard.tsx'
import GameTable from '../components/game/GameTable.tsx'
import type { GameSeat, TrickCard } from '../components/game/GameTable.tsx'
import BidPrompt from '../components/game/BidPrompt.tsx'
import Lobby from '../components/game/Lobby.tsx'
import type { LobbySeat } from '../components/game/Lobby.tsx'
import Settlement from '../components/game/Settlement.tsx'

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank })

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{ color: '#eaf6ee', fontFamily: 'system-ui, sans-serif', marginBottom: 16 }}>{title}</h2>
      {children}
    </section>
  )
}

const mockSeats: GameSeat[] = [
  { seat: 0, name: 'You', initials: 'JC', isYou: true, isDealer: false, hasPassed: false, connected: true },
  { seat: 1, name: 'Sam', initials: 'SM', isYou: false, isDealer: true, hasPassed: false, connected: true },
  { seat: 2, name: 'Robin', initials: 'RB', isYou: false, isDealer: false, hasPassed: true, connected: true },
  { seat: 3, name: 'Alex', initials: 'AX', isYou: false, isDealer: false, hasPassed: false, connected: false },
]

const mockTrick: TrickCard[] = [
  { seat: 0, card: null },
  { seat: 1, card: c('hearts', 'A') },
  { seat: 2, card: c('hearts', '10') },
  { seat: 3, card: null },
]

const mockHand: Card[] = [
  c('hearts', '9'),
  c('hearts', 'J'),
  c('spades', 'J'),
  c('clubs', 'Q'),
  c('diamonds', 'K'),
]

const mockLobbySeats: LobbySeat[] = [
  { seat: 0, filled: true, name: 'Josh', initials: 'JC', isDealer: true },
  { seat: 1, filled: true, name: 'Sam', initials: 'SM' },
  { seat: 2, filled: false },
  { seat: 3, filled: false },
]

export default function DevPreview() {
  return (
    <div style={{ background: '#0b2c21', minHeight: '100vh', padding: 32 }}>
      <h1 style={{ color: '#eaf6ee', fontFamily: 'system-ui, sans-serif' }}>Dev Preview — Phase 3 checkpoint 1</h1>
      <p style={{ color: '#b9d6c4', fontFamily: 'system-ui, sans-serif', marginBottom: 40 }}>
        Static components with mock props. Temporary route, remove once wired to real state.
      </p>

      <Section title="PlayingCard">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24 }}>
          <PlayingCard card={c('hearts', 'A')} size="small" />
          <PlayingCard card={c('spades', 'J')} size="small" isTrump />
          <PlayingCard card={c('clubs', '10')} size="large" />
          <PlayingCard card={c('diamonds', 'Q')} size="large" isTrump />
          <PlayingCard faceDown size="small" />
          <PlayingCard faceDown size="large" />
        </div>

        <p style={{ color: '#b9d6c4', fontFamily: 'system-ui, sans-serif', fontSize: 13, marginBottom: 8 }}>
          Fanned opponent hand indicator (face-down, small size):
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end' }}>
          {[0, 1, 2, 3, 4].map((index) => {
            const offset = index - 2
            return (
              <div
                key={index}
                style={{ margin: '0 -10px', transform: `rotate(${offset * 6}deg) translateY(${Math.abs(offset) * 6}px)`, transformOrigin: 'bottom center' }}
              >
                <PlayingCard faceDown size="small" />
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="GameTable">
        <GameTable seats={mockSeats} trick={mockTrick} trumpSuit="hearts" score={{ us: 4, them: 7 }} hand={mockHand} status="playing" />
      </Section>

      <Section title="GameTable — bidding round 2 (turned-up card flipped face-down)">
        <GameTable
          seats={mockSeats}
          trick={[]}
          trumpSuit={null}
          score={{ us: 0, them: 0 }}
          hand={mockHand}
          status="bidding"
          turnedUpCard={c('hearts', 'A')}
          turnedUpCardFaceDown
          centerContent={
            <BidPrompt
              round={2}
              legalSuits={['clubs', 'spades', 'diamonds']}
              onCallSuit={(suit, alone) => console.log('call suit', { suit, alone })}
              onPass={() => console.log('pass')}
            />
          }
        />
      </Section>

      <Section title="BidPrompt — Round 1">
        <BidPrompt
          round={1}
          turnedUpSuit="hearts"
          onOrderUp={(alone) => console.log('order up', { alone })}
          onPass={() => console.log('pass')}
        />
      </Section>

      <Section title="BidPrompt — Round 2">
        <BidPrompt
          round={2}
          legalSuits={['clubs', 'spades', 'diamonds']}
          onCallSuit={(suit, alone) => console.log('call suit', { suit, alone })}
          onPass={() => console.log('pass')}
        />
      </Section>

      <Section title="Lobby">
        <div style={{ marginLeft: -32, marginRight: -32 }}>
          <Lobby
            joinCode="EUCH-482"
            houseRulesSummary="Stick the dealer • Win by 2 • No throw-downs"
            seats={mockLobbySeats}
            onStart={() => console.log('start game')}
            onCopyJoinCode={() => console.log('copy join code')}
          />
        </div>
      </Section>

      <Section title="Settlement — you win">
        <div style={{ marginLeft: -32, marginRight: -32 }}>
          <Settlement
            finalScore={{ us: 10, them: 6 }}
            youWon={true}
            rows={[
              { from: 'Sam', to: 'Josh', amount: 5, bumpTags: ['Euchre bump'] },
              { from: 'Alex', to: 'Robin', amount: 2.5 },
            ]}
            onRematch={() => console.log('rematch')}
            onLeave={() => console.log('leave table')}
          />
        </div>
      </Section>

      <Section title="Settlement — you lose">
        <div style={{ marginLeft: -32, marginRight: -32 }}>
          <Settlement
            finalScore={{ us: 6, them: 10 }}
            youWon={false}
            rows={[{ from: 'Josh', to: 'Sam', amount: 5, bumpTags: ['Euchre bump'] }]}
            onRematch={() => console.log('rematch')}
            onLeave={() => console.log('leave table')}
          />
        </div>
      </Section>
    </div>
  )
}
