-- The in-process heartbeat lease.
--
-- One app instance owns the timer's lease at a time. The lease expires after
-- fifteen minutes, so a replica that dies without releasing it hands over to
-- the next tick on a surviving instance. Nothing here grants authority: the
-- tick still runs the whole scheduler guard chain.
alter table office_state add column if not exists scheduler_owner text;
alter table office_state add column if not exists scheduler_owner_at timestamptz;
