-- ============================================================================
-- Sunshade Tracker: Add order_index column to projects table
--
-- Enables persistent fractional / integer ordering indices for workspace
-- projects (FEAT-TRK-PROJECT-MODAL-REORDER).
-- Safe and idempotent: can be executed on PostgreSQL without error.
-- ============================================================================

DO $$
BEGIN
  -- Add order_index if tracker schema exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'tracker' AND table_name = 'projects') THEN
    ALTER TABLE tracker.projects ADD COLUMN IF NOT EXISTS order_index DOUBLE PRECISION;
  END IF;

  -- Add order_index if public schema has projects
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS order_index DOUBLE PRECISION;
  END IF;
END $$;
