import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Excludes 0/O/1/I/L -- codes are meant to be read aloud or typed by hand.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const JOIN_CODE_LENGTH = 6
const MAX_JOIN_CODE_ATTEMPTS = 10

function generateJoinCode(): string {
  const bytes = new Uint8Array(JOIN_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[bytes[i] % JOIN_CODE_ALPHABET.length]
  }
  return code
}

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
    // policy yet, so creating a game and seating its first player both go through here.
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    let game: { id: string; join_code: string } | null = null
    let lastError: unknown = null

    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
      const joinCode = generateJoinCode()
      const { data, error } = await db
        .from('games')
        .insert({ join_code: joinCode, status: 'waiting', dealer_seat: 0, hand_number: 0 })
        .select('id, join_code')
        .single()

      if (!error) {
        game = data
        break
      }
      // 23505 is a unique_violation -- collided with an existing join_code, generate another.
      if (error.code !== '23505') {
        console.error('create-game: failed to insert game', error)
        return jsonResponse({ error: 'Failed to create game' }, 500)
      }
      lastError = error
    }

    if (!game) {
      console.error('create-game: exhausted join code attempts', lastError)
      return jsonResponse({ error: 'Failed to generate a unique join code, try again' }, 500)
    }

    const { error: playerError } = await db.from('players').insert({
      game_id: game.id,
      user_id: callerId,
      seat: 0,
      connected: true,
    })

    if (playerError) {
      // Best-effort cleanup so a failed seat insert doesn't leave an orphaned game row behind.
      await db.from('games').delete().eq('id', game.id)
      console.error('create-game: failed to seat creator', playerError)
      return jsonResponse({ error: 'Failed to seat you in the new game' }, 500)
    }

    return jsonResponse({ gameId: game.id, joinCode: game.join_code }, 200)
  } catch (err) {
    console.error('create-game unexpected error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
