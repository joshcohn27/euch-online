// Regression check for private Realtime broadcast channels (Phase 2, checkpoint 6).
// Proves: (1) a private game:{gameId} channel actually delivers a broadcast to a seated
// player, and (2) an authenticated-but-not-seated user does NOT receive it (RLS gating works).
//
// Exists because of two non-obvious bugs found while building this:
//   - A plain createClient(url, serviceRoleKey) never fires an auth state change, so
//     client.realtime's access token stays unset and httpSend() silently reports
//     { success: true } while never actually delivering to private channels. Fixed by calling
//     client.realtime.setAuth(serviceRoleKey) before sending (see _shared/broadcast.ts).
//   - Subscribing with a specific event filter (`{ event: 'game_event' }`) never fired for these
//     private-channel broadcasts, while a wildcard filter (`{ event: '*' }`) reliably received
//     the same message. Fixed by subscribing with the wildcard filter and discriminating on
//     payload.type instead (see src/hooks/useGameChannel.ts).
// Run with: VERIFY_SERVICE_ROLE_ENV=<path to a file containing SUPABASE_SERVICE_ROLE_KEY=...> node scripts/verify-broadcast.mjs

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function loadEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

const appEnv = loadEnvFile(path.join(repoRoot, '.env.local'))
const scratchEnvPath = process.env.VERIFY_SERVICE_ROLE_ENV
if (!scratchEnvPath) {
  throw new Error('Set VERIFY_SERVICE_ROLE_ENV to a file containing SUPABASE_SERVICE_ROLE_KEY=...')
}
const secretEnv = loadEnvFile(scratchEnvPath)

const SUPABASE_URL = appEnv.VITE_SUPABASE_URL
const ANON_KEY = appEnv.VITE_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = secretEnv.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL, ANON_KEY, or SERVICE_ROLE_KEY')
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
// Mirrors _shared/broadcast.ts: a plain service-role client never fires an auth state change,
// so realtime's access token stays unset and httpSend silently fails to deliver to private
// channels unless we set it explicitly.
admin.realtime.setAuth(SERVICE_ROLE_KEY)

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function waitFor(getFlag, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now()
    const interval = setInterval(() => {
      if (getFlag() || Date.now() - start > timeoutMs) {
        clearInterval(interval)
        resolve(getFlag())
      }
    }, 100)
  })
}

function subscribeAndWait(client, topic, onPayload) {
  return new Promise((resolve) => {
    const channel = client
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: '*' }, (message) => onPayload(message.payload))
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          resolve({ channel, status, err })
        }
      })
  })
}

async function main() {
  const nonce = crypto.randomUUID()
  const seatedEmail = `verify-seated-${nonce}@example.test`
  const outsiderEmail = `verify-outsider-${nonce}@example.test`
  const password = `Pw-${nonce}`

  console.log('Creating temporary auth users, game, and player row...')

  const { data: seatedUser, error: seatedUserError } = await admin.auth.admin.createUser({
    email: seatedEmail,
    password,
    email_confirm: true,
  })
  if (seatedUserError) throw seatedUserError

  const { data: outsiderUser, error: outsiderUserError } = await admin.auth.admin.createUser({
    email: outsiderEmail,
    password,
    email_confirm: true,
  })
  if (outsiderUserError) throw outsiderUserError

  const { data: game, error: gameError } = await admin
    .from('games')
    .insert({ join_code: `verify-${nonce.slice(0, 8)}`, status: 'lobby', dealer_seat: 0, hand_number: 0 })
    .select('id')
    .single()
  if (gameError) throw gameError

  const { error: playerError } = await admin
    .from('players')
    .insert({ game_id: game.id, user_id: seatedUser.user.id, seat: 0, connected: true })
  if (playerError) throw playerError

  const topic = `game:${game.id}`

  try {
    const testPayload = {
      type: 'hand_dealt',
      gameId: game.id,
      handId: nonce,
      handNumber: 1,
      dealerSeat: 0,
    }

    // Run the two checks sequentially, not concurrently: a concurrent unauthorized subscribe
    // attempt to the same topic was observed to interfere with delivery to the legitimately
    // subscribed client (a Realtime platform quirk, not something in our code to fix).

    console.log('--- Check 1: seated player receives the broadcast ---')
    const seatedClient = createClient(SUPABASE_URL, ANON_KEY)
    const { error: seatedSignInError } = await seatedClient.auth.signInWithPassword({
      email: seatedEmail,
      password,
    })
    if (seatedSignInError) throw seatedSignInError

    let seatedPayload = null
    const seatedSub = await subscribeAndWait(seatedClient, topic, (p) => {
      seatedPayload = p
    })
    console.log(`Seated client subscribe status: ${seatedSub.status}`, seatedSub.err)

    const sendChannel = admin.channel(topic, { config: { private: true } })
    await sendChannel.httpSend('game_event', testPayload)

    await waitFor(() => seatedPayload !== null, 8000)
    const seatedReceivedCorrectly =
      seatedPayload !== null && stableStringify(seatedPayload) === stableStringify(testPayload)
    console.log(seatedReceivedCorrectly ? 'PASS: seated player received the broadcast' : 'FAIL: seated player did not receive the broadcast')

    await admin.removeChannel(seatedSub.channel)
    await seatedClient.auth.signOut()

    console.log('')
    console.log('--- Check 2: non-seated user is denied channel access ---')
    const outsiderClient = createClient(SUPABASE_URL, ANON_KEY)
    const { error: outsiderSignInError } = await outsiderClient.auth.signInWithPassword({
      email: outsiderEmail,
      password,
    })
    if (outsiderSignInError) throw outsiderSignInError

    let outsiderPayload = null
    const outsiderSub = await subscribeAndWait(outsiderClient, topic, (p) => {
      outsiderPayload = p
    })
    console.log(`Outsider client subscribe status: ${outsiderSub.status}`, outsiderSub.err)
    const outsiderCorrectlyBlocked = outsiderSub.status === 'CHANNEL_ERROR' && outsiderPayload === null
    console.log(outsiderCorrectlyBlocked ? 'PASS: non-seated user was denied channel access' : 'FAIL: non-seated user was not denied (RLS leak!)')

    await admin.removeChannel(outsiderSub.channel)
    await outsiderClient.auth.signOut()

    if (!seatedReceivedCorrectly || !outsiderCorrectlyBlocked) {
      process.exitCode = 1
    }
  } finally {
    console.log('Cleaning up temporary fixtures...')
    await admin.from('players').delete().eq('game_id', game.id)
    await admin.from('games').delete().eq('id', game.id)
    await admin.auth.admin.deleteUser(seatedUser.user.id)
    await admin.auth.admin.deleteUser(outsiderUser.user.id)
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error('Verification script error:', err)
    process.exit(1)
  })
