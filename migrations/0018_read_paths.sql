-- Read paths the office actually runs.
--
-- `readSnapshot` feeds every office page, and it reads the newest rows of each
-- book with `order by <time> desc limit n`. The indexes added with the original
-- schema are composite (`status, created_at desc`), so they cannot serve an
-- unfiltered "newest first" sort and Postgres falls back to a full sort on every
-- page load. These single-column indexes match the sort the query really uses.
--
-- Every statement is idempotent so this file is safe to re-apply.

create index if not exists inbound_created_idx on inbound_items (created_at desc);
create index if not exists leads_updated_idx on leads (updated_at desc);
create index if not exists opportunities_updated_idx on opportunities (updated_at desc);
create index if not exists campaigns_created_idx on campaigns (created_at desc);
create index if not exists documents_created_idx on documents (created_at desc);
create index if not exists approvals_created_idx on approvals (created_at desc);
create index if not exists tickets_updated_idx on tickets (updated_at desc);
create index if not exists founder_notices_created_idx on founder_notices (created_at desc);
