-- Real time of each event's block, so transfers from Mezo and Base can be ordered together
-- (their block numbers are unrelated) and paginated with a unique, stable cursor.
ALTER TABLE chain_events ADD COLUMN IF NOT EXISTS block_time TIMESTAMPTZ;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS origin_time TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS transfers_origin_time ON transfers (origin_time DESC, transfer_id DESC);

-- Revisit existing events to fill their block times on an upgraded database. The indexer
-- upserts timestamps and advances the cursor normally; a fresh database has nothing to rewind.
UPDATE chain_cursor c SET next_block = LEAST(c.next_block, e.first_block)
FROM (SELECT chain, MIN(block_number) AS first_block FROM chain_events WHERE block_time IS NULL GROUP BY chain) e
WHERE c.chain = e.chain;
