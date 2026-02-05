-- Migration: add packages.price_ugx + packages.is_active and seed official bundle prices
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260202_001_add_packages_price_ugx_and_seed_official.sql

BEGIN;

-- Add columns (backward compatible)
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS price_ugx INTEGER NULL;

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Ensure the 5 official bundles exist and have the exact canonical prices.
DO $$
DECLARE
  updated_count int;
BEGIN
  -- 2 Hours
  UPDATE packages
  SET name = '2 Hours',
      mikrotik_profile = '2h-unlimited',
      duration_minutes = 120,
      price_ugx = 500,
      is_active = TRUE
  WHERE duration_minutes = 120;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    INSERT INTO packages (name, duration_minutes, mikrotik_profile, price_ugx, is_active)
    VALUES ('2 Hours', 120, '2h-unlimited', 500, TRUE)
    ON CONFLICT (name) DO UPDATE
    SET duration_minutes = EXCLUDED.duration_minutes,
        mikrotik_profile = EXCLUDED.mikrotik_profile,
        price_ugx = EXCLUDED.price_ugx,
        is_active = TRUE;
  END IF;

  -- 12 Hours
  UPDATE packages
  SET name = '12 Hours',
      mikrotik_profile = '12h-unlimited',
      duration_minutes = 720,
      price_ugx = 1000,
      is_active = TRUE
  WHERE duration_minutes = 720;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    INSERT INTO packages (name, duration_minutes, mikrotik_profile, price_ugx, is_active)
    VALUES ('12 Hours', 720, '12h-unlimited', 1000, TRUE)
    ON CONFLICT (name) DO UPDATE
    SET duration_minutes = EXCLUDED.duration_minutes,
        mikrotik_profile = EXCLUDED.mikrotik_profile,
        price_ugx = EXCLUDED.price_ugx,
        is_active = TRUE;
  END IF;

  -- Daily
  UPDATE packages
  SET name = 'Daily',
      mikrotik_profile = 'daily-unlimited',
      duration_minutes = 1440,
      price_ugx = 1500,
      is_active = TRUE
  WHERE duration_minutes = 1440;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    INSERT INTO packages (name, duration_minutes, mikrotik_profile, price_ugx, is_active)
    VALUES ('Daily', 1440, 'daily-unlimited', 1500, TRUE)
    ON CONFLICT (name) DO UPDATE
    SET duration_minutes = EXCLUDED.duration_minutes,
        mikrotik_profile = EXCLUDED.mikrotik_profile,
        price_ugx = EXCLUDED.price_ugx,
        is_active = TRUE;
  END IF;

  -- Weekly
  UPDATE packages
  SET name = 'Weekly',
      mikrotik_profile = 'weekly-unlimited',
      duration_minutes = 10080,
      price_ugx = 6000,
      is_active = TRUE
  WHERE duration_minutes = 10080;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    INSERT INTO packages (name, duration_minutes, mikrotik_profile, price_ugx, is_active)
    VALUES ('Weekly', 10080, 'weekly-unlimited', 6000, TRUE)
    ON CONFLICT (name) DO UPDATE
    SET duration_minutes = EXCLUDED.duration_minutes,
        mikrotik_profile = EXCLUDED.mikrotik_profile,
        price_ugx = EXCLUDED.price_ugx,
        is_active = TRUE;
  END IF;

  -- Monthly
  UPDATE packages
  SET name = 'Monthly',
      mikrotik_profile = 'monthly-unlimited',
      duration_minutes = 43200,
      price_ugx = 23000,
      is_active = TRUE
  WHERE duration_minutes = 43200;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    INSERT INTO packages (name, duration_minutes, mikrotik_profile, price_ugx, is_active)
    VALUES ('Monthly', 43200, 'monthly-unlimited', 23000, TRUE)
    ON CONFLICT (name) DO UPDATE
    SET duration_minutes = EXCLUDED.duration_minutes,
        mikrotik_profile = EXCLUDED.mikrotik_profile,
        price_ugx = EXCLUDED.price_ugx,
        is_active = TRUE;
  END IF;

  -- Deactivate non-official bundles (keeps historical rows but prevents sale)
  UPDATE packages
  SET is_active = FALSE
  WHERE duration_minutes NOT IN (120, 720, 1440, 10080, 43200);
END $$;

COMMIT;
