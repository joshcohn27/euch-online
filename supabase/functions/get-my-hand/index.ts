import { createClient } from 'npm:@supabase/supabase-js@2'
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
    let body: { handId?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const handId = body.handId
    if (typeof handId !== 'string' || handId.length === 0) {
      return jsonResponse({ error: 'handId is required' }, 400)
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

    // Service-role client for everything else -- hand_cards has no client-facing policies at all.
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: hand, error: handError } = await db
      .from('hands')
      .select('id, game_id')
      .eq('id', handId)
      .maybeSingle()

    if (handError) {
      return jsonResponse({ error: 'Failed to load hand' }, 500)
    }
    if (!hand) {
      return jsonResponse({ error: 'Hand not found' }, 404)
    }

    const { data: player, error: playerError } = await db
      .from('players')
      .select('seat')
      .eq('game_id', hand.game_id)
      .eq('user_id', callerId)
      .maybeSingle()

    if (playerError) {
      return jsonResponse({ error: 'Failed to load player' }, 500)
    }
    if (!player) {
      return jsonResponse({ error: 'You are not a seated player in this game' }, 403)
    }

    const { data: handCards, error: handCardsError } = await db
      .from('hand_cards')
      .select('cards')
      .eq('hand_id', handId)
      .eq('seat', player.seat)
      .maybeSingle()

    if (handCardsError) {
      return jsonResponse({ error: 'Failed to load hand cards' }, 500)
    }
    if (!handCards) {
      return jsonResponse({ error: 'No cards found for this hand and seat' }, 404)
    }

    return jsonResponse({ seat: player.seat, cards: handCards.cards }, 200)
  } catch (err) {
    console.error('get-my-hand unexpected error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
