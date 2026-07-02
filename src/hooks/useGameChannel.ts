import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { gameChannelTopic, type GameEvent } from '../realtime/gameEvents'

export type { GameEvent }

/**
 * Subscribes to a game's private Realtime broadcast channel and calls onEvent for each
 * game_event received. Subscribes with a wildcard event filter and discriminates on
 * payload.type rather than filtering by event name in the subscription itself -- a specific
 * `{ event: 'game_event' }` filter was found to silently never fire for private channels fed by
 * a service-role sender, while a wildcard filter on the same channel reliably receives them.
 */
export function useGameChannel(gameId: string | null | undefined, onEvent: (event: GameEvent) => void): void {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel(gameChannelTopic(gameId), { config: { private: true } })
      .on('broadcast', { event: '*' }, (message) => {
        onEventRef.current(message.payload as GameEvent)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])
}
