-- Phase 2, checkpoint 6: scope private Realtime broadcast channels (topic `game:{gameId}`)
-- to seated players of that game. realtime.messages has RLS enabled with no policies yet,
-- so private channels are otherwise inaccessible to any client.

create policy "seated players can read broadcasts for their game"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() like 'game:%'
  and exists (
    select 1
    from public.players
    where players.game_id = regexp_replace(realtime.topic(), '^game:', '')::uuid
      and players.user_id = auth.uid()
  )
);
