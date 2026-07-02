import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildDeck, shuffleDeck, dealHand } from '../../../src/engine/deck.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
    let body: { gameId?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const gameId = body.gameId
    if (typeof gameId !== 'string' || gameId.length === 0) {
      return jsonResponse({ error: 'gameId is required' }, 400)
    }

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

    // Service-role client for everything else -- hand_cards has no client-facing policies at all,
    // and dealing/writes in general are never trusted from client-side RLS.
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: game, error: gameError } = await db
      .from('games')
      .select('id, dealer_seat, hand_number')
      .eq('id', gameId)
      .maybeSingle()

    if (gameError) {
      return jsonResponse({ error: 'Failed to load game' }, 500)
    }
    if (!game) {
      return jsonResponse({ error: 'Game not found' }, 404)
    }

    if (game.hand_number > 0) {
      const { data: currentHand, error: currentHandError } = await db
        .from('hands')
        .select('status')
        .eq('game_id', gameId)
        .eq('hand_number', game.hand_number)
        .maybeSingle()

      if (currentHandError) {
        return jsonResponse({ error: 'Failed to load current hand' }, 500)
      }
      if (!currentHand || currentHand.status !== 'complete') {
        return jsonResponse({ error: 'A hand is already in progress for this game' }, 409)
      }
    }

    const { data: players, error: playersError } = await db
      .from('players')
      .select('seat, user_id')
      .eq('game_id', gameId)

    if (playersError) {
      return jsonResponse({ error: 'Failed to load players' }, 500)
    }
    const seatedPlayers = players ?? []
    if (!seatedPlayers.some((p) => p.user_id === callerId)) {
      return jsonResponse({ error: 'You are not a seated player in this game' }, 403)
    }
    if (seatedPlayers.length !== 4) {
      return jsonResponse({ error: 'All 4 seats must be filled before dealing' }, 409)
    }

    const newHandNumber = game.hand_number + 1
    const newDealerSeat = game.dealer_seat

    const deck = shuffleDeck(buildDeck())
    const { hands, kitty } = dealHand(deck)

    const { data: newHand, error: insertHandError } = await db
      .from('hands')
      .insert({
        game_id: gameId,
        hand_number: newHandNumber,
        dealer_seat: newDealerSeat,
        trump_suit: null,
        maker_seat: null,
        kitty,
        status: 'bidding',
      })
      .select('id, hand_number')
      .single()

    if (insertHandError || !newHand) {
      return jsonResponse({ error: 'Failed to create hand' }, 500)
    }

    const handCardsRows = ([0, 1, 2, 3] as const).map((seat) => ({
      hand_id: newHand.id as string,
      seat,
      cards: hands[seat],
    }))

    const { error: insertCardsError } = await db.from('hand_cards').insert(handCardsRows)

    if (insertCardsError) {
      // Best-effort cleanup so a failed deal doesn't leave an orphaned hand row behind.
      await db.from('hands').delete().eq('id', newHand.id)
      return jsonResponse({ error: 'Failed to deal cards' }, 500)
    }

    // Advance the game's rolling dealer/hand-number pointer for the next deal-hand call.
    // The hand_number match guards against a concurrent deal-hand call racing this one.
    const { error: updateGameError, count } = await db
      .from('games')
      .update(
        {
          dealer_seat: (newDealerSeat + 1) % 4,
          hand_number: newHandNumber,
        },
        { count: 'exact' },
      )
      .eq('id', gameId)
      .eq('hand_number', game.hand_number)

    if (updateGameError || count === 0) {
      await db.from('hand_cards').delete().eq('hand_id', newHand.id)
      await db.from('hands').delete().eq('id', newHand.id)
      return jsonResponse({ error: 'A hand is already being dealt for this game, try again' }, 409)
    }

    return jsonResponse({ handId: newHand.id, handNumber: newHand.hand_number }, 200)
  } catch (err) {
    console.error('deal-hand unexpected error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
