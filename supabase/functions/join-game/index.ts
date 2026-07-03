import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Seat } from '../../../src/engine/types.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { broadcastGameEvent } from '../_shared/broadcast.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SEATS: Seat[] = [0, 1, 2, 3]

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    let body: { joinCode?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    if (typeof body.joinCode !== 'string' || body.joinCode.trim().length === 0) {
      return jsonResponse({ error: 'joinCode is required' }, 400)
    }
    const joinCode = body.joinCode.trim().toUpperCase()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    // Client scoped to the caller's own JWT -- used only to verify who is calling.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Not authenticated' }, 401)
    }
    const callerId = userData.user.id

    // Service-role client for everything else -- games/players have no client-side insert
    // policy yet, so seating a joining player goes through here.
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: game, error: gameError } = await db
      .from('games')
      .select('id')
      .eq('join_code', joinCode)
      .maybeSingle()

    if (gameError) {
      return jsonResponse({ error: 'Failed to look up game' }, 500)
    }
    if (!game) {
      return jsonResponse({ error: 'Game not found' }, 404)
    }

    const { data: players, error: playersError } = await db
      .from('players')
      .select('seat, user_id')
      .eq('game_id', game.id)

    if (playersError) {
      return jsonResponse({ error: 'Failed to load players' }, 500)
    }
    const seatedPlayers = players ?? []

    // Already seated -- treat as idempotent so a refresh or re-click of a join link doesn't error.
    const existingSeat = seatedPlayers.find((p) => p.user_id === callerId)
    if (existingSeat) {
      return jsonResponse({ gameId: game.id, seat: existingSeat.seat }, 200)
    }

    if (seatedPlayers.length >= 4) {
      return jsonResponse({ error: 'This game is already full' }, 409)
    }

    const takenSeats = new Set(seatedPlayers.map((p) => p.seat))
    const nextSeat = SEATS.find((seat) => !takenSeats.has(seat))
    if (nextSeat === undefined) {
      console.error('join-game: no open seat found despite seat count check', { gameId: game.id })
      return jsonResponse({ error: 'This game is already full' }, 409)
    }

    const { error: insertError } = await db.from('players').insert({
      game_id: game.id,
      user_id: callerId,
      seat: nextSeat,
      connected: true,
    })

    if (insertError) {
      // 23505 is a unique_violation -- another request filled this seat first, ask to retry.
      if (insertError.code === '23505') {
        return jsonResponse({ error: 'That seat was just taken, try again' }, 409)
      }
      console.error('join-game: failed to seat player', insertError)
      return jsonResponse({ error: 'Failed to join game' }, 500)
    }

    await broadcastGameEvent(db, SUPABASE_SERVICE_ROLE_KEY, game.id, {
      type: 'player_joined',
      gameId: game.id,
      seat: nextSeat,
      userId: callerId,
    })

    return jsonResponse({ gameId: game.id, seat: nextSeat }, 200)
  } catch (err) {
    console.error('join-game unexpected error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
