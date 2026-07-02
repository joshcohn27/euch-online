-- Fixes a type mismatch found while building make-bid: play-card (Phase 2, checkpoint 3)
-- reads/writes trick_plays.card as a full { suit, rank } Card object, but the column was
-- text, not jsonb, unlike hand_cards.cards and hands.kitty which store cards the same way.
-- No rows exist in trick_plays yet, so this is a plain type change with no data to migrate.

alter table public.trick_plays
  alter column card type jsonb using card::jsonb;
