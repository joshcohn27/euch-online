-- Phase 2, checkpoint 4: bid-state tracking for make-bid.
-- hands.status has no CHECK constraint in this schema, so the new 'discarding' value
-- (set between a successful order-up and the dealer's discard) needs no column change.

alter table public.hands
  add column bid_round integer;

alter table public.hands
  add constraint hands_bid_round_check check (bid_round is null or (bid_round >= 1 and bid_round <= 2));

-- Append-only log of each bid action for a hand. Public game state like tricks/trick_plays --
-- who ordered up, passed, or called is not hidden information, so it is directly client-readable.
-- Only make-bid (service role) writes to it.
create table public.bids (
  id uuid primary key default gen_random_uuid(),
  hand_id uuid not null references public.hands(id) on delete cascade,
  round integer not null check (round >= 1 and round <= 2),
  seat integer not null check (seat >= 0 and seat <= 3),
  action text not null check (action in ('pass', 'order_up', 'call')),
  suit text,
  alone boolean not null default false,
  created_at timestamptz not null default now(),
  unique (hand_id, round, seat)
);

alter table public.bids enable row level security;

create policy "read bids" on public.bids for select using (true);
