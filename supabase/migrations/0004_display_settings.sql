-- Display settings on the profile.
--
-- The profiler already asks for an age, and until now the only thing it did
-- with it was print it back on the profile screen. It proposes a text size and
-- a simplified layout from it now, both of which the reader can override at
-- the moment they are proposed and change again later.
--
-- Both carry a default, so every profile written before this migration reads
-- back as the standard screen rather than as null.

alter table public.profiles
  -- 1 is the designed size; the profiler offers 1.15 and 1.3. Bounded rather
  -- than free, because the frame is 390pt wide and past 1.3 the buttons stop
  -- fitting their labels.
  add column if not exists text_scale numeric(3, 2) not null default 1
    check (text_scale between 1 and 1.3),
  add column if not exists simple_ui boolean not null default false;
