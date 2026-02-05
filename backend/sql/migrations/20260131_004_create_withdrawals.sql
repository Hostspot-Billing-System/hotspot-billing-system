-- Migration: create withdrawals + withdrawal_transactions tables
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260131_004_create_withdrawals.sql

BEGIN;

CREATE TABLE IF NOT EXISTS withdrawals (
  id BIGSERIAL PRIMARY KEY,

  reference VARCHAR(64) UNIQUE NOT NULL,
  agent_id BIGINT NULL,
  client_id BIGINT NULL,

  total_amount NUMERIC(12,2) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payout_method VARCHAR(30) NOT NULL,
  payout_account VARCHAR(50) NOT NULL,

  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_agent_id ON withdrawals(agent_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_client_id ON withdrawals(client_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_requested_at ON withdrawals(requested_at);

CREATE TABLE IF NOT EXISTS withdrawal_transactions (
  withdrawal_id BIGINT NOT NULL,
  transaction_id BIGINT NOT NULL,
  PRIMARY KEY (withdrawal_id, transaction_id)
);

-- Add constraints separately to keep migration rerunnable.
DO $$
BEGIN
  BEGIN
    ALTER TABLE withdrawal_transactions
      ADD CONSTRAINT withdrawal_transactions_withdrawal_id_fkey
      FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id) ON DELETE RESTRICT;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE withdrawal_transactions
      ADD CONSTRAINT withdrawal_transactions_transaction_id_fkey
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Helpful for reverse lookups and exclusion queries
CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_transaction_id
  ON withdrawal_transactions(transaction_id);

COMMIT;
