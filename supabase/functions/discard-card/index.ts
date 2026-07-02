import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Card, Rank, Seat, Suit } from '../../../src/engine/types.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { broadcastGameEvent } from '../_shared/broadcast.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']
const RANKS: Rank[] = ['9', '10', 'J', 'Q', 'K', 'A']

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isValidCard(value: unknown): value is Card {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    typeof c.suit === 'string' &&
    SUITS.includes(c.suit as Suit) &&
    typeof c.rank === 'string' &&
    RANKS.includes(c.rank as Rank)
  )
}

function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    let body: { handId?: unknown; card?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const handId = body.handId
    if (typeof handId !== 'string' || handId.length === 0) {
      return jsonResponse({ error: 'handId is required' }, 400)
    }

    const card = body.card
    if (!isValidCard(card)) {
      return jsonResponse({ error: 'card must be a valid { suit, rank } object' }, 400)
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

    // Service-role client for everything else -- hand_cards is never written from client-side RLS.
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: hand, error: handError } = await db
      .from('hands')
      .select('id, game_id, dealer_seat, status')
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
    const callerSeat = player.seat as Seat
    const dealerSeat = hand.dealer_seat as Seat

    if (hand.status !== 'discarding') {
      return jsonResponse({ error: `Hand is not awaiting a discard (status: ${hand.status})` }, 409)
    }
    if (callerSeat !== dealerSeat) {
      return jsonResponse({ error: 'Only the dealer can discard for this hand' }, 403)
    }

    const { data: handCards, error: handCardsError } = await db
      .from('hand_cards')
      .select('cards')
      .eq('hand_id', handId)
      .eq('seat', dealerSeat)
      .maybeSingle()

    if (handCardsError) {
      return jsonResponse({ error: 'Failed to load hand cards' }, 500)
    }
    if (!handCards) {
      return jsonResponse({ error: 'No cards found for the dealer in this hand' }, 404)
    }
    const currentCards = handCards.cards as Card[]

    if (!currentCards.some((c) => cardsEqual(c, card))) {
      return jsonResponse({ error: 'You do not have that card in your hand' }, 400)
    }

    const remainingCards = currentCards.filter((c) => !cardsEqual(c, card))
    const { error: updateHandCardsError } = await db
      .from('hand_cards')
      .update({ cards: remainingCards })
      .eq('hand_id', handId)
      .eq('seat', dealerSeat)

    if (updateHandCardsError) {
      return jsonResponse({ error: 'Failed to update hand cards after discard' }, 500)
    }

    const { error: updateHandError } = await db
      .from('hands')
      .update({ status: 'playing' })
      .eq('id', handId)

    if (updateHandError) {
      return jsonResponse({ error: 'Failed to finalize hand after discard' }, 500)
    }

    await broadcastGameEvent(db, SUPABASE_SERVICE_ROLE_KEY, hand.game_id, {
      type: 'card_discarded',
      gameId: hand.game_id,
      handId,
      seat: dealerSeat,
      status: 'playing',
    })

    return jsonResponse({ handId, status: 'playing' }, 200)
  } catch (err) {
    console.error('discard-card unexpected error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
