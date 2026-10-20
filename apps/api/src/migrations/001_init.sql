-- MUSD Reach indexer schema. Every row is derived from, and traceable to, a chain log.
-- The database is a cache of chain history, never the authority for balances or backing.

CREATE TABLE IF NOT EXISTS chain_cursor (
  chain              TEXT PRIMARY KEY,           -- 'mezo' | 'base'
  next_block         BIGINT NOT NULL,            -- next block to scan
  finalized_block    BIGINT NOT NULL DEFAULT 0,  -- highest block known finalized at last tick
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_events (
  chain              TEXT NOT NULL,
  block_number       BIGINT NOT NULL,
  block_hash         TEXT NOT NULL,
  tx_hash            TEXT NOT NULL,
  log_index          INTEGER NOT NULL,
  contract           TEXT NOT NULL,
  event              TEXT NOT NULL,
  transfer_id        TEXT,
  args               JSONB NOT NULL,
  finalized          BOOLEAN NOT NULL DEFAULT FALSE,
  observed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS chain_events_transfer ON chain_events (transfer_id);
CREATE INDEX IF NOT EXISTS chain_events_block ON chain_events (chain, block_number);

CREATE TABLE IF NOT EXISTS transfers (
  transfer_id        TEXT PRIMARY KEY,
  direction          TEXT NOT NULL,              -- 'ISSUE' | 'REDEEM'
  status             TEXT NOT NULL,
  shares             NUMERIC(78,0) NOT NULL,
  sender             TEXT NOT NULL,
  recipient          TEXT NOT NULL,
  redeem_mode        INTEGER,
  wormhole_sequence  NUMERIC(20,0) NOT NULL,
  origin_tx          TEXT NOT NULL,
  origin_block       BIGINT NOT NULL,
  origin_finalized   BOOLEAN NOT NULL,
  target_tx          TEXT,
  target_block       BIGINT,
  target_finalized   BOOLEAN,
  vaa_digest         TEXT,
  vaa_checked_at     TIMESTAMPTZ,
  musd_out           NUMERIC(78,0),
  fell_back          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfers_sender ON transfers (lower(sender));
CREATE INDEX IF NOT EXISTS transfers_recipient ON transfers (lower(recipient));
CREATE INDEX IF NOT EXISTS transfers_created ON transfers (origin_block DESC);

CREATE TABLE IF NOT EXISTS wrapper_observations (
  block_number       BIGINT PRIMARY KEY,
  block_timestamp    BIGINT NOT NULL,
  total_assets       NUMERIC(78,0) NOT NULL,
  total_supply       NUMERIC(78,0) NOT NULL,
  principal          NUMERIC(78,0) NOT NULL,
  idle               NUMERIC(78,0) NOT NULL,
  pending_yield      NUMERIC(78,0) NOT NULL,
  assets_per_share   NUMERIC(78,0) NOT NULL,
  observed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_snapshots (
  id                 BIGSERIAL PRIMARY KEY,
  status             TEXT NOT NULL,
  mezo_block         BIGINT NOT NULL,
  base_block         BIGINT NOT NULL,
  total_locked       NUMERIC(78,0) NOT NULL,
  remote_supply      NUMERIC(78,0) NOT NULL,
  pending_issue      NUMERIC(78,0) NOT NULL,
  pending_redeem     NUMERIC(78,0) NOT NULL,
  discrepancy        NUMERIC(78,0) NOT NULL,
  observed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_runs (
  job                TEXT PRIMARY KEY,
  last_ok_at         TIMESTAMPTZ,
  last_error_at      TIMESTAMPTZ,
  last_error         TEXT,
  consecutive_errors INTEGER NOT NULL DEFAULT 0
);
