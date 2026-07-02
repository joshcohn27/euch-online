import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Card, PlayedCard, Rank, Seat, Suit, TrickState } from '../../../src/engine/types.ts'
import { isLegalPlay, resolveTrick } from '../../../src/engine/trickResolution.ts'
import { getEffectiveSuit } from '../../../src/engine/trumpRules.ts'
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

    // Service-role client for everything else -- trick_plays and hand_cards are never written
    // from client-side RLS, and dealing/play validation must happen server-side.
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: hand, error: handError } = await db
      .from('hands')
      .select('id, game_id, trump_suit, status, dealer_seat')
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

    if (hand.status !== 'playing') {
      return jsonResponse(
        {
          error: `Hand is not ready for card play (status: ${hand.status}). Bidding must be complete and trump called first.`,
        },
        409,
      )
    }
    const trumpSuit = hand.trump_suit as Suit | null
    if (!trumpSuit) {
      return jsonResponse({ error: 'Hand is marked playing but has no trump suit set' }, 500)
    }

    const { data: lastTrick, error: lastTrickError } = await db
      .from('tricks')
      .select('id, trick_number, lead_seat, winner_seat')
      .eq('hand_id', handId)
      .order('trick_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastTrickError) {
      return jsonResponse({ error: 'Failed to load current trick' }, 500)
    }

    let trickId: string
    let trickNumber: number
    let leadSeat: Seat
    let isNewTrick: boolean

    if (!lastTrick || lastTrick.winner_seat !== null) {
      isNewTrick = true
      trickNumber = lastTrick ? lastTrick.trick_number + 1 : 1
      leadSeat = lastTrick ? (lastTrick.winner_seat as Seat) : (((hand.dealer_seat as Seat) + 1) % 4 as Seat)
    } else {
      isNewTrick = false
      trickId = lastTrick.id
      trickNumber = lastTrick.trick_number
      leadSeat = lastTrick.lead_seat as Seat
    }

    let existingPlays: { seat: Seat; card: Card; play_order: number }[] = []
    if (!isNewTrick) {
      const { data: plays, error: playsError } = await db
        .from('trick_plays')
        .select('seat, card, play_order')
        .eq('trick_id', trickId!)
        .order('play_order', { ascending: true })

      if (playsError) {
        return jsonResponse({ error: 'Failed to load trick plays' }, 500)
      }
      existingPlays = (plays ?? []) as { seat: Seat; card: Card; play_order: number }[]
    }

    const nextPlayOrder = existingPlays.length
    const expectedSeat = ((leadSeat + nextPlayOrder) % 4) as Seat
    if (callerSeat !== expectedSeat) {
      return jsonResponse({ error: 'It is not your turn to play' }, 409)
    }

    const { data: handCards, error: handCardsError } = await db
      .from('hand_cards')
      .select('cards')
      .eq('hand_id', handId)
      .eq('seat', callerSeat)
      .maybeSingle()

    if (handCardsError) {
      return jsonResponse({ error: 'Failed to load hand cards' }, 500)
    }
    if (!handCards) {
      return jsonResponse({ error: 'No cards found for this hand and seat' }, 404)
    }
    const currentHand = handCards.cards as Card[]

    if (!currentHand.some((c) => cardsEqual(c, card))) {
      return jsonResponse({ error: 'You do not have that card in your hand' }, 400)
    }

    if (nextPlayOrder > 0) {
      const ledSuit = getEffectiveSuit(existingPlays[0].card, trumpSuit)
      if (!isLegalPlay(card, currentHand, ledSuit, trumpSuit)) {
        return jsonResponse({ error: 'You must follow suit' }, 400)
      }
    }

    if (isNewTrick) {
      const { data: newTrick, error: insertTrickError } = await db
        .from('tricks')
        .insert({
          hand_id: handId,
          trick_number: trickNumber,
          lead_seat: leadSeat,
          winner_seat: null,
        })
        .select('id')
        .single()

      if (insertTrickError || !newTrick) {
        return jsonResponse({ error: 'Failed to start new trick' }, 500)
      }
      trickId = newTrick.id
    }

    const { error: insertPlayError } = await db.from('trick_plays').insert({
      trick_id: trickId!,
      seat: callerSeat,
      card,
      play_order: nextPlayOrder,
    })

    if (insertPlayError) {
      if (isNewTrick) {
        await db.from('tricks').delete().eq('id', trickId!)
      }
      return jsonResponse({ error: 'Failed to record card play' }, 500)
    }

    const remainingCards = currentHand.filter((c) => !cardsEqual(c, card))
    const { error: updateHandCardsError } = await db
      .from('hand_cards')
      .update({ cards: remainingCards })
      .eq('hand_id', handId)
      .eq('seat', callerSeat)

    if (updateHandCardsError) {
      return jsonResponse({ error: 'Failed to update hand cards after play' }, 500)
    }

    const cardsPlayed: PlayedCard[] = [
      ...existingPlays.map((p) => ({ seat: p.seat, card: p.card })),
      { seat: callerSeat, card },
    ]

    let winnerSeat: Seat | null = null
    if (cardsPlayed.length === 4) {
      const trickState: TrickState = {
        trickNumber,
        leadSeat,
        cardsPlayed,
        winner: null,
      }
      winnerSeat = resolveTrick(trickState, trumpSuit)

      const { error: updateTrickError } = await db
        .from('tricks')
        .update({ winner_seat: winnerSeat })
        .eq('id', trickId!)

      if (updateTrickError) {
        return jsonResponse({ error: 'Failed to record trick winner' }, 500)
      }
    }

    await broadcastGameEvent(db, SUPABASE_SERVICE_ROLE_KEY, hand.game_id, {
      type: 'card_played',
      gameId: hand.game_id,
      handId,
      seat: callerSeat,
      card,
      trickNumber,
      cardsPlayed,
      winnerSeat,
    })

    return jsonResponse(
      {
        trickNumber,
        cardsPlayed,
        winnerSeat,
      },
      200,
    )
  } catch (err) {
    console.error('play-card unexpected error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
