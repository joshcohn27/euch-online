import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Card, GameRules, Seat, Suit } from '../../../src/engine/types.ts'
import {
  bidOrderForRound,
  processRound1,
  processRound2,
  type BidAction,
} from '../../../src/engine/bidding.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { broadcastGameEvent } from '../_shared/broadcast.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']

// TODO: games has no house-rules configuration yet (tied to the lobby/room creation flow,
// not yet built). Once that exists, load per-game rules instead of hardcoding this.
const DEFAULT_RULES: GameRules = { stickTheDealer: false, winByTwo: false, throwDowns: false }

type BidRequestAction = 'pass' | 'order_up' | 'call_suit'

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
    let body: { handId?: unknown; action?: unknown; suit?: unknown; goAlone?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const handId = body.handId
    if (typeof handId !== 'string' || handId.length === 0) {
      return jsonResponse({ error: 'handId is required' }, 400)
    }

    const action = body.action
    if (action !== 'pass' && action !== 'order_up' && action !== 'call_suit') {
      return jsonResponse({ error: "action must be 'pass', 'order_up', or 'call_suit'" }, 400)
    }
    const bidRequestAction = action as BidRequestAction

    let suit: Suit | null = null
    if (bidRequestAction === 'call_suit') {
      if (typeof body.suit !== 'string' || !SUITS.includes(body.suit as Suit)) {
        return jsonResponse({ error: 'suit is required and must be a valid suit for call_suit' }, 400)
      }
      suit = body.suit as Suit
    }

    let alone = false
    if (body.goAlone !== undefined) {
      if (typeof body.goAlone !== 'boolean') {
        return jsonResponse({ error: 'goAlone must be a boolean' }, 400)
      }
      alone = body.goAlone
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

    // Service-role client for everything else -- bid resolution and the resulting hand/hand_cards
    // writes are never trusted from client-side RLS.
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: hand, error: handError } = await db
      .from('hands')
      .select('id, game_id, dealer_seat, trump_suit, maker_seat, kitty, status, bid_round')
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

    if (hand.status !== 'bidding') {
      return jsonResponse(
        { error: `Hand is not in bidding (status: ${hand.status})` },
        409,
      )
    }

    const kitty = hand.kitty as Card[] | null
    if (!kitty || kitty.length === 0) {
      return jsonResponse({ error: 'Hand has no turned-up card in its kitty' }, 500)
    }
    const turnedUpCard = kitty[0]

    const effectiveRound = (hand.bid_round ?? 1) as 1 | 2

    if (bidRequestAction === 'order_up' && effectiveRound !== 1) {
      return jsonResponse({ error: 'order_up is only valid in bidding round 1' }, 400)
    }
    if (bidRequestAction === 'call_suit' && effectiveRound !== 2) {
      return jsonResponse({ error: 'call_suit is only valid in bidding round 2' }, 400)
    }
    const { data: existingBidRows, error: bidsError } = await db
      .from('bids')
      .select('seat, action, suit, alone')
      .eq('hand_id', handId)
      .eq('round', effectiveRound)
      .order('created_at', { ascending: true })

    if (bidsError) {
      return jsonResponse({ error: 'Failed to load bid history' }, 500)
    }
    const existingBids = existingBidRows ?? []

    if (existingBids.length >= 4) {
      return jsonResponse({ error: 'This bidding round is already complete' }, 409)
    }

    const expectedSeat = bidOrderForRound(dealerSeat)[existingBids.length]
    if (callerSeat !== expectedSeat) {
      return jsonResponse({ error: 'It is not your turn to bid' }, 409)
    }

    const existingActions: BidAction[] = existingBids.map((row) => {
      if (row.action === 'order_up') {
        return { seat: row.seat as Seat, type: 'order_up', alone: row.alone }
      }
      if (row.action === 'call') {
        return { seat: row.seat as Seat, type: 'call', suit: row.suit as Suit, alone: row.alone }
      }
      return { seat: row.seat as Seat, type: 'pass' }
    })

    const newAction: BidAction =
      bidRequestAction === 'pass'
        ? { seat: callerSeat, type: 'pass' }
        : bidRequestAction === 'order_up'
          ? { seat: callerSeat, type: 'order_up', alone }
          : { seat: callerSeat, type: 'call', suit: suit as Suit, alone }

    const allActions = [...existingActions, newAction]

    let outcome
    try {
      outcome =
        effectiveRound === 1
          ? processRound1(allActions, turnedUpCard)
          : processRound2(allActions, turnedUpCard, DEFAULT_RULES, dealerSeat)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid bid'
      return jsonResponse({ error: message }, 400)
    }

    const dbAction = bidRequestAction === 'call_suit' ? 'call' : bidRequestAction
    const { error: insertBidError } = await db.from('bids').insert({
      hand_id: handId,
      round: effectiveRound,
      seat: callerSeat,
      action: dbAction,
      suit: bidRequestAction === 'call_suit' ? suit : null,
      alone,
    })

    if (insertBidError) {
      return jsonResponse(
        { error: 'Failed to record bid (you may have already bid this round)' },
        409,
      )
    }

    let newStatus = hand.status as string
    let nextRound: 1 | 2 | null = null
    let nextSeat: Seat | null = null
    let allPassed = false

    if (outcome.called) {
      const isOrderUp = outcome.round === 1
      newStatus = isOrderUp ? 'discarding' : 'playing'

      const { error: updateHandError } = await db
        .from('hands')
        .update({
          trump_suit: outcome.trumpSuit,
          maker_seat: outcome.maker,
          bid_round: null,
          status: newStatus,
        })
        .eq('id', handId)

      if (updateHandError) {
        return jsonResponse({ error: 'Failed to finalize bid on hand' }, 500)
      }

      if (isOrderUp) {
        const { data: dealerCards, error: dealerCardsError } = await db
          .from('hand_cards')
          .select('cards')
          .eq('hand_id', handId)
          .eq('seat', dealerSeat)
          .maybeSingle()

        if (dealerCardsError || !dealerCards) {
          return jsonResponse({ error: "Failed to load dealer's hand for pickup" }, 500)
        }

        const updatedDealerCards = [...(dealerCards.cards as Card[]), turnedUpCard]
        const { error: updateDealerCardsError } = await db
          .from('hand_cards')
          .update({ cards: updatedDealerCards })
          .eq('hand_id', handId)
          .eq('seat', dealerSeat)

        if (updateDealerCardsError) {
          return jsonResponse({ error: "Failed to add turned-up card to dealer's hand" }, 500)
        }
      }
    } else if (allActions.length === 4) {
      if (effectiveRound === 1) {
        const { error: updateRoundError } = await db
          .from('hands')
          .update({ bid_round: 2 })
          .eq('id', handId)

        if (updateRoundError) {
          return jsonResponse({ error: 'Failed to advance to bidding round 2' }, 500)
        }
        nextRound = 2
        nextSeat = bidOrderForRound(dealerSeat)[0]
      } else {
        allPassed = true
      }
    } else {
      nextRound = effectiveRound
      nextSeat = bidOrderForRound(dealerSeat)[allActions.length]
    }

    await broadcastGameEvent(db, SUPABASE_SERVICE_ROLE_KEY, hand.game_id, {
      type: 'bid_made',
      gameId: hand.game_id,
      handId,
      seat: callerSeat,
      action: bidRequestAction,
      suit,
      alone,
      status: newStatus,
      round: nextRound,
      nextSeat,
      called: outcome.called,
      trumpSuit: outcome.called ? outcome.trumpSuit : null,
      makerSeat: outcome.called ? outcome.maker : null,
    })

    return jsonResponse(
      {
        handId,
        status: newStatus,
        round: nextRound,
        nextSeat,
        called: outcome.called,
        trumpSuit: outcome.called ? outcome.trumpSuit : null,
        makerSeat: outcome.called ? outcome.maker : null,
        alone: outcome.called ? outcome.alone : false,
        allPassed,
      },
      200,
    )
  } catch (err) {
    console.error('make-bid unexpected error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
