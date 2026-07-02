import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { GAME_EVENT_NAME, gameChannelTopic, type GameEvent } from '../../../src/realtime/gameEvents.ts'

export type { GameEvent }

/**
 * Broadcasts a game state event on the private `game:{gameId}` channel via REST (no websocket
 * handshake). `serviceRoleKey` must be passed explicitly and set on the client's realtime auth --
 * a plain `createClient(url, serviceRoleKey)` never fires an auth state change (no sign-in ever
 * happens), so `client.realtime`'s access token stays unset and httpSend silently fails to
 * deliver to private channels (it still resolves { success: true }, since only the apikey header
 * is checked at intake) unless we set it ourselves.
 */
export async function broadcastGameEvent(
  client: SupabaseClient,
  serviceRoleKey: string,
  gameId: string,
  event: GameEvent,
): Promise<void> {
  client.realtime.setAuth(serviceRoleKey)
  const channel = client.channel(gameChannelTopic(gameId), { config: { private: true } })
  await channel.httpSend(GAME_EVENT_NAME, event)
}
