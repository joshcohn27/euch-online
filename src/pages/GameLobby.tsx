import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Seat } from '../engine/types.ts'
import { useGameChannel } from '../hooks/useGameChannel'
import type { GameEvent } from '../hooks/useGameChannel'
import Lobby from '../components/game/Lobby'
import type { LobbySeat } from '../components/game/Lobby'
import styles from './GameLobby.module.css'

type Screen = 'entry' | 'loading' | 'lobby' | 'started'

const SEATS: Seat[] = [0, 1, 2, 3]

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
  const [screen, setScreen] = useState<Screen>(initialJoinCode ? 'loading' : 'entry')
  const [gameId, setGameId] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [seats, setSeats] = useState<LobbySeat[]>(SEATS.map((seat) => ({ seat, filled: false })))
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lobbyLoading, setLobbyLoading] = useState(false)
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
      .select('seat, user_id')
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

  useEffect(() => {
    if (!gameId || screen !== 'lobby') return
    setLobbyLoading(true)
    loadLobby(gameId).finally(() => setLobbyLoading(false))
  }, [gameId, screen, loadLobby])

  // A join code in the URL (fresh page load, refresh, or shared link) is resolved the same way
  // as the manual join form -- join-game is idempotent for a caller who is already seated, so
  // this also covers the creator reloading their own lobby.
  useEffect(() => {
    if (!initialJoinCode) return
    let cancelled = false

    invokeFunction<{ gameId: string; seat: number }>('join-game', { joinCode: initialJoinCode })
      .then((data) => {
        if (cancelled) return
        setGameId(data.gameId)
        setJoinCode(initialJoinCode.toUpperCase())
        setScreen('lobby')
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
      setScreen('lobby')
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
      setScreen('lobby')
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
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Game started</h1>
          <p className={styles.loadingText}>Game started. Table view coming in the next checkpoint.</p>
        </div>
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
