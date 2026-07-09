import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Card, Seat, Suit } from '../engine/types.ts'
import { bidOrderForRound } from '../engine/bidding.ts'
import { useGameChannel } from '../hooks/useGameChannel'
import type { GameEvent } from '../hooks/useGameChannel'
import Lobby from '../components/game/Lobby'
import type { LobbySeat } from '../components/game/Lobby'
import GameTable from '../components/game/GameTable'
import type { GameSeat, TrickCard } from '../components/game/GameTable'
import BidPrompt from '../components/game/BidPrompt'
import styles from './GameLobby.module.css'

type Screen = 'entry' | 'loading' | 'lobby' | 'started'

const SEATS: Seat[] = [0, 1, 2, 3]
const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']

// Games have no house-rules configuration yet (tied to a lobby settings flow not yet built).
const HOUSE_RULES_SUMMARY = 'Default rules (house rules configuration coming soon)'

// Keeps the join code in the URL (rather than only in component state) so a refresh or a
// shared link lands back in the same lobby instead of the entry screen.
function updateUrlJoinCode(code: string | null): void {
  window.history.replaceState(null, '', code ? `/game-lobby/${code}` : '/game-lobby')
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

interface PlayerRow {
  seat: Seat
  userId: string
  connected: boolean
  name: string
}

interface HandInfo {
  handId: string
  dealerSeat: Seat
  trumpSuit: Suit | null
  status: string
}

interface BidState {
  round: 1 | 2
  nextSeat: Seat | null
  turnedUpCard: Card
  passedSeats: Seat[]
}

interface TrickState {
  trickNumber: number
  leadSeat: Seat
  cardsPlayed: { seat: Seat; card: Card }[]
  winnerSeat: Seat | null
}

// Mirrors play-card's own "whose turn is it" derivation: once a trick is complete, its winner
// leads next (no trick row exists for that yet), otherwise it's whoever is next after the lead.
function deriveExpectedPlaySeat(trick: TrickState): Seat {
  if (trick.winnerSeat !== null) {
    return trick.winnerSeat
  }
  return ((trick.leadSeat + trick.cardsPlayed.length) % 4) as Seat
}

function buildTrickCards(cardsPlayed: { seat: Seat; card: Card }[]): TrickCard[] {
  return SEATS.map((seat) => ({ seat, card: cardsPlayed.find((p) => p.seat === seat)?.card ?? null }))
}

// Bidding/trick state isn't wired up until checkpoints 5-8, so this is a plain label rather
// than the real BidPrompt or a turn indicator.
function statusLabelFor(status: string): string {
  switch (status) {
    case 'bidding':
      return 'Bidding in progress'
    case 'discarding':
      return 'Dealer is discarding'
    case 'playing':
      return 'Hand in progress'
    case 'complete':
      return 'Hand complete'
    default:
      return status
  }
}

function buildGameSeats(
  rows: PlayerRow[],
  dealerSeat: Seat,
  currentUserId: string | null,
  passedSeats: Seat[],
): GameSeat[] {
  return SEATS.map((seat) => {
    const hasPassed = passedSeats.includes(seat)
    const row = rows.find((r) => r.seat === seat)
    if (!row) {
      return { seat, name: 'Unknown', initials: '??', isYou: false, isDealer: seat === dealerSeat, hasPassed, connected: false }
    }
    return {
      seat,
      name: row.name,
      initials: getInitials(row.name),
      isYou: row.userId === currentUserId,
      isDealer: seat === dealerSeat,
      hasPassed,
      connected: row.connected,
    }
  })
}

async function fetchGameStatus(id: string): Promise<string> {
  const { data, error } = await supabase.from('games').select('status').eq('id', id).single()
  if (error || !data) {
    throw new Error('Failed to load game status')
  }
  return data.status as string
}

async function invokeFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, body ? { body } : undefined)
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const parsed = await error.context.json().catch(() => null)
      if (parsed && typeof parsed.error === 'string') {
        throw new Error(parsed.error)
      }
    }
    throw error
  }
  if (data === null) {
    throw new Error('Edge Function returned no data')
  }
  return data
}

export interface GameLobbyProps {
  initialJoinCode: string | null
}

export default function GameLobby({ initialJoinCode }: GameLobbyProps) {
  const { user } = useAuth()
  const [screen, setScreen] = useState<Screen>(initialJoinCode ? 'loading' : 'entry')
  const [gameId, setGameId] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [seats, setSeats] = useState<LobbySeat[]>(SEATS.map((seat) => ({ seat, filled: false })))
  const [playerRows, setPlayerRows] = useState<PlayerRow[]>([])
  const [handInfo, setHandInfo] = useState<HandInfo | null>(null)
  const [bidState, setBidState] = useState<BidState | null>(null)
  const [trickState, setTrickState] = useState<TrickState | null>(null)
  const [trickCounts, setTrickCounts] = useState<Record<Seat, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 })
  const [myHand, setMyHand] = useState<Card[]>([])
  const [selectedDiscardCard, setSelectedDiscardCard] = useState<Card | null>(null)
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lobbyLoading, setLobbyLoading] = useState(false)
  const [tableLoading, setTableLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLobby = useCallback(async (id: string) => {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('join_code, status, dealer_seat')
      .eq('id', id)
      .single()

    if (gameError || !game) {
      setError('Failed to load game')
      return
    }

    setJoinCode(game.join_code)
    if (game.status === 'playing') {
      setScreen('started')
    }

    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('seat, user_id, connected')
      .eq('game_id', id)

    if (playersError || !players) {
      setError('Failed to load players')
      return
    }

    let nameById = new Map<string, string | null>()
    if (players.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in(
          'id',
          players.map((p) => p.user_id),
        )

      if (profilesError) {
        setError('Failed to load player names')
        return
      }
      nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]))
    }

    setPlayerRows(
      players.map((p) => ({
        seat: p.seat as Seat,
        userId: p.user_id as string,
        connected: p.connected as boolean,
        name: nameById.get(p.user_id) ?? 'Player',
      })),
    )

    setSeats(
      SEATS.map((seat) => {
        const row = players.find((p) => p.seat === seat)
        if (!row) return { seat, filled: false }
        const name = nameById.get(row.user_id) ?? 'Player'
        return {
          seat,
          filled: true,
          name,
          initials: getInitials(name),
          isDealer: seat === (game.dealer_seat as Seat),
        }
      }),
    )
  }, [])

  const loadTable = useCallback(async (id: string) => {
    try {
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('hand_number')
        .eq('id', id)
        .single()

      if (gameError || !game) {
        setError('Failed to load game')
        return
      }

      const { data: hand, error: handError } = await supabase
        .from('hands')
        .select('id, dealer_seat, trump_suit, status, bid_round, kitty')
        .eq('game_id', id)
        .eq('hand_number', game.hand_number)
        .maybeSingle()

      if (handError) {
        setError('Failed to load hand')
        return
      }
      if (!hand) {
        setError('No active hand found for this game')
        return
      }

      const dealerSeat = hand.dealer_seat as Seat

      setHandInfo({
        handId: hand.id as string,
        dealerSeat,
        trumpSuit: hand.trump_suit as Suit | null,
        status: hand.status as string,
      })

      if (hand.status !== 'discarding') {
        setSelectedDiscardCard(null)
      }

      if (hand.status === 'bidding') {
        const bidRound = (hand.bid_round as 1 | 2 | null) ?? 1
        const { data: bids, error: bidsError } = await supabase
          .from('bids')
          .select('seat, action')
          .eq('hand_id', hand.id)
          .eq('round', bidRound)

        if (bidsError) {
          setError('Failed to load bid state')
          return
        }

        const existingBids = bids ?? []
        const order = bidOrderForRound(dealerSeat)
        const nextSeat = existingBids.length < 4 ? order[existingBids.length] : null
        const passedSeats = existingBids.filter((b) => b.action === 'pass').map((b) => b.seat as Seat)
        const kitty = hand.kitty as Card[]

        setBidState({ round: bidRound, nextSeat, turnedUpCard: kitty[0], passedSeats })
      } else {
        setBidState(null)
      }

      if (hand.status === 'playing') {
        const { data: allTricks, error: tricksError } = await supabase
          .from('tricks')
          .select('id, trick_number, lead_seat, winner_seat')
          .eq('hand_id', hand.id)
          .order('trick_number', { ascending: true })

        if (tricksError) {
          setError('Failed to load trick state')
          return
        }

        const tricks = allTricks ?? []
        const counts: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
        for (const t of tricks) {
          if (t.winner_seat !== null) counts[t.winner_seat as Seat] += 1
        }
        setTrickCounts(counts)

        const lastTrick = tricks[tricks.length - 1] ?? null

        if (!lastTrick) {
          setTrickState({ trickNumber: 1, leadSeat: ((dealerSeat + 1) % 4) as Seat, cardsPlayed: [], winnerSeat: null })
        } else {
          const { data: plays, error: playsError } = await supabase
            .from('trick_plays')
            .select('seat, card')
            .eq('trick_id', lastTrick.id)
            .order('play_order', { ascending: true })

          if (playsError) {
            setError('Failed to load trick plays')
            return
          }

          setTrickState({
            trickNumber: lastTrick.trick_number as number,
            leadSeat: lastTrick.lead_seat as Seat,
            cardsPlayed: (plays ?? []).map((p) => ({ seat: p.seat as Seat, card: p.card as Card })),
            winnerSeat: lastTrick.winner_seat as Seat | null,
          })
        }
      } else {
        setTrickState(null)
        setTrickCounts({ 0: 0, 1: 0, 2: 0, 3: 0 })
      }

      const cardsData = await invokeFunction<{ seat: number; cards: Card[] }>('get-my-hand', { handId: hand.id })
      setMyHand(cardsData.cards)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hand')
    }
  }, [])

  useEffect(() => {
    if (!gameId || screen !== 'lobby') return
    setLobbyLoading(true)
    loadLobby(gameId).finally(() => setLobbyLoading(false))
  }, [gameId, screen, loadLobby])

  useEffect(() => {
    if (!gameId || screen !== 'started') return
    setTableLoading(true)
    loadTable(gameId).finally(() => setTableLoading(false))
  }, [gameId, screen, loadTable])

  // A join code in the URL (fresh page load, refresh, or shared link) is resolved the same way
  // as the manual join form -- join-game is idempotent for a caller who is already seated, so
  // this also covers the creator reloading their own lobby. games.status is checked directly
  // rather than always defaulting to the lobby screen, so reloading into an already-started
  // game goes straight to the table instead of briefly (or persistently) showing Start Game.
  useEffect(() => {
    if (!initialJoinCode) return
    let cancelled = false

    invokeFunction<{ gameId: string; seat: number }>('join-game', { joinCode: initialJoinCode })
      .then(async (data) => {
        if (cancelled) return
        setGameId(data.gameId)
        setJoinCode(initialJoinCode.toUpperCase())
        const status = await fetchGameStatus(data.gameId)
        if (cancelled) return
        setScreen(status === 'playing' ? 'started' : 'lobby')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load game')
        setScreen('entry')
        updateUrlJoinCode(null)
      })

    return () => {
      cancelled = true
    }
  }, [initialJoinCode])

  useGameChannel(gameId, (event: GameEvent) => {
    if (event.type === 'player_joined') {
      if (gameId) loadLobby(gameId)
    } else if (event.type === 'hand_dealt') {
      setScreen('started')
      if (gameId) loadTable(gameId)
    } else if (event.type === 'bid_made') {
      if (gameId) loadTable(gameId)
    } else if (event.type === 'card_discarded') {
      if (gameId) loadTable(gameId)
    } else if (event.type === 'card_played') {
      if (gameId) loadTable(gameId)
    }
  })

  const handleCreateGame = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = await invokeFunction<{ gameId: string; joinCode: string }>('create-game')
      setJoinCode(data.joinCode)
      setGameId(data.gameId)
      updateUrlJoinCode(data.joinCode)
      const status = await fetchGameStatus(data.gameId)
      setScreen(status === 'playing' ? 'started' : 'lobby')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
    } finally {
      setBusy(false)
    }
  }

  const handleJoinGame = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = joinCodeInput.trim()
    if (!trimmed) {
      setError('Enter a join code')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const data = await invokeFunction<{ gameId: string; seat: number }>('join-game', { joinCode: trimmed })
      setGameId(data.gameId)
      updateUrlJoinCode(trimmed.toUpperCase())
      const status = await fetchGameStatus(data.gameId)
      setScreen(status === 'playing' ? 'started' : 'lobby')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game')
    } finally {
      setBusy(false)
    }
  }

  const handleStartGame = () => {
    if (!gameId || busy) return
    setBusy(true)
    setError(null)
    invokeFunction('deal-hand', { gameId })
      .then(() => setScreen('started'))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to start game'))
      .finally(() => setBusy(false))
  }

  const handleBid = (action: 'pass' | 'order_up' | 'call_suit', suit?: Suit, alone?: boolean) => {
    if (!gameId || !handInfo || busy) return
    setBusy(true)
    setError(null)
    invokeFunction('make-bid', { handId: handInfo.handId, action, suit, alone })
      .then(() => loadTable(gameId))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to submit bid'))
      .finally(() => setBusy(false))
  }

  const handleDiscard = () => {
    if (!gameId || !handInfo || !selectedDiscardCard || busy) return
    setBusy(true)
    setError(null)
    invokeFunction('discard-card', { handId: handInfo.handId, card: selectedDiscardCard })
      .then(() => {
        setSelectedDiscardCard(null)
        return loadTable(gameId)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to discard'))
      .finally(() => setBusy(false))
  }

  const handlePlayCard = (card: Card) => {
    if (!gameId || !handInfo || busy) return
    setBusy(true)
    setError(null)
    invokeFunction('play-card', { handId: handInfo.handId, card })
      .then(() => loadTable(gameId))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to play card'))
      .finally(() => setBusy(false))
  }

  if (screen === 'entry') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Euch-Online</h1>

          <button type="button" className={styles.primaryButton} onClick={handleCreateGame} disabled={busy}>
            {busy ? 'Please wait...' : 'Create Game'}
          </button>

          <div className={styles.divider}>or</div>

          <form className={styles.joinForm} onSubmit={handleJoinGame}>
            <input
              type="text"
              className={styles.joinInput}
              placeholder="Join code"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              maxLength={6}
              disabled={busy}
            />
            <button type="submit" className={styles.secondaryButton} disabled={busy}>
              Join Game
            </button>
          </form>

          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      </div>
    )
  }

  if (screen === 'loading') {
    return (
      <div className={styles.page}>
        <p className={styles.loadingText}>Loading lobby...</p>
      </div>
    )
  }

  if (screen === 'started') {
    if (tableLoading || !handInfo) {
      return (
        <div className={styles.page}>
          <p className={styles.loadingText}>Loading table...</p>
        </div>
      )
    }

    const mySeat = playerRows.find((r) => r.userId === user?.id)?.seat ?? null
    const gameSeats = buildGameSeats(playerRows, handInfo.dealerSeat, user?.id ?? null, bidState?.passedSeats ?? [])
    const isMyDiscardTurn = handInfo.status === 'discarding' && mySeat === handInfo.dealerSeat
    const isHandAllTricksDone = trickState !== null && trickState.trickNumber === 5 && trickState.winnerSeat !== null
    const isMyPlayTurn =
      handInfo.status === 'playing' &&
      trickState !== null &&
      !isHandAllTricksDone &&
      mySeat !== null &&
      deriveExpectedPlaySeat(trickState) === mySeat
    const isMyLeadTurn = isMyPlayTurn && trickState !== null && trickState.cardsPlayed.length === 0

    let topPanel: ReactNode = <p className={styles.statusLabel}>{statusLabelFor(handInfo.status)}</p>
    let centerContent: ReactNode = null

    if (handInfo.status === 'bidding' && bidState) {
      topPanel = null
      if (mySeat !== null && bidState.nextSeat === mySeat) {
        centerContent =
          bidState.round === 1 ? (
            <BidPrompt
              round={1}
              turnedUpSuit={bidState.turnedUpCard.suit}
              onOrderUp={(alone) => handleBid('order_up', undefined, alone)}
              onPass={() => handleBid('pass')}
              disabled={busy}
            />
          ) : (
            <BidPrompt
              round={2}
              legalSuits={SUITS.filter((s) => s !== bidState.turnedUpCard.suit)}
              onCallSuit={(suit, alone) => handleBid('call_suit', suit, alone)}
              onPass={() => handleBid('pass')}
              disabled={busy}
            />
          )
      } else {
        const waitingName =
          bidState.nextSeat !== null ? (playerRows.find((r) => r.seat === bidState.nextSeat)?.name ?? 'next player') : 'next player'
        centerContent = <p className={styles.statusLabel}>Waiting for {waitingName} to bid</p>
      }
    } else if (handInfo.status === 'discarding') {
      if (isMyDiscardTurn) {
        topPanel = (
          <div className={styles.discardBar}>
            <p className={styles.statusLabel}>Select a card to discard</p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleDiscard}
              disabled={!selectedDiscardCard || busy}
            >
              Discard
            </button>
          </div>
        )
      } else {
        const dealerName = playerRows.find((r) => r.seat === handInfo.dealerSeat)?.name ?? 'the dealer'
        topPanel = <p className={styles.statusLabel}>Waiting for {dealerName} to discard</p>
      }
    } else if (handInfo.status === 'playing' && trickState) {
      if (isHandAllTricksDone) {
        topPanel = <p className={styles.statusLabel}>Hand complete, no next steps yet</p>
      } else if (trickState.winnerSeat !== null) {
        const winnerName = playerRows.find((r) => r.seat === trickState.winnerSeat)?.name ?? 'Someone'
        topPanel = <p className={styles.statusLabel}>{winnerName} wins the trick</p>
      } else if (isMyLeadTurn) {
        topPanel = null
      } else if (isMyPlayTurn) {
        topPanel = <p className={styles.statusLabel}>Your turn to play</p>
      } else {
        const expectedSeat = deriveExpectedPlaySeat(trickState)
        const turnName = playerRows.find((r) => r.seat === expectedSeat)?.name ?? 'next player'
        topPanel = <p className={styles.statusLabel}>Waiting for {turnName} to play</p>
      }
    }

    return (
      <div className={styles.tablePage}>
        {topPanel}
        {error && <p className={styles.errorBanner}>{error}</p>}
        <GameTable
          seats={gameSeats}
          trick={trickState ? buildTrickCards(trickState.cardsPlayed) : []}
          trumpSuit={handInfo.trumpSuit}
          score={{ us: 0, them: 0 }}
          hand={myHand}
          status={handInfo.status}
          turnedUpCard={bidState?.turnedUpCard ?? null}
          turnedUpCardFaceDown={bidState?.round === 2}
          tricksWonBySeat={trickCounts}
          showLeadPrompt={isMyLeadTurn}
          centerContent={centerContent}
          onCardClick={
            isMyDiscardTurn
              ? (card) => setSelectedDiscardCard(card)
              : isMyPlayTurn
                ? (card) => handlePlayCard(card)
                : undefined
          }
          selectedCard={isMyDiscardTurn ? selectedDiscardCard : null}
        />
      </div>
    )
  }

  if (lobbyLoading && !joinCode) {
    return (
      <div className={styles.page}>
        <p className={styles.loadingText}>Loading lobby...</p>
      </div>
    )
  }

  return (
    <div>
      {error && <p className={styles.errorBanner}>{error}</p>}
      <Lobby joinCode={joinCode ?? ''} houseRulesSummary={HOUSE_RULES_SUMMARY} seats={seats} onStart={handleStartGame} />
    </div>
  )
}
