-- ============================================================================
-- SunShade Tracker: Sprint Scope Guardrails & Immutable Estimates Migration
-- File: supabase/migrations/20261001000000_sprint_scope_guardrails.sql
--
-- Implements:
--   1. Schema fields: is_active, started_at, ends_at, committed_points on tracker.sprints
--   2. Postgres trigger prevent_point_drift_on_active_sprint() enforcing immutable
--      story_points on work items assigned to active sprints (SQLSTATE 23514).
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS tracker;

-- ----------------------------------------------------------------------------
-- 1. Ensure tracker.sprints table exists with guardrail fields
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracker.sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tracker.tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES tracker.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  is_active BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  committed_points INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist if table was already created earlier
ALTER TABLE tracker.sprints ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tracker.sprints ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE tracker.sprints ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE tracker.sprints ADD COLUMN IF NOT EXISTS committed_points INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tracker_sprints_lookup 
  ON tracker.sprints (tenant_id, project_id, name);

CREATE INDEX IF NOT EXISTS idx_tracker_sprints_active 
  ON tracker.sprints (tenant_id, is_active) 
  WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 2. Guardrail 3 Trigger: prevent_point_drift_on_active_sprint()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tracker.prevent_point_drift_on_active_sprint()
RETURNS TRIGGER AS $$
DECLARE
  v_sprint_name TEXT;
  v_sprint_id TEXT;
  v_is_active BOOLEAN := false;
  v_found RECORD;
BEGIN
  -- Only evaluate when metadata story_points was modified
  IF (OLD.metadata->>'story_points') IS NOT DISTINCT FROM (NEW.metadata->>'story_points') THEN
    RETURN NEW;
  END IF;

  v_sprint_name := COALESCE(NEW.metadata->>'sprint', OLD.metadata->>'sprint');
  v_sprint_id := COALESCE(NEW.metadata->>'sprint_id', OLD.metadata->>'sprint_id');

  -- If item is not assigned to any sprint, allow point update
  IF v_sprint_name IS NULL AND v_sprint_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Check tracker.sprints table for an active sprint
  IF EXISTS (
    SELECT 1 FROM tracker.sprints s
    WHERE (s.name = v_sprint_name OR s.id::text = v_sprint_id)
      AND (s.is_active = true OR s.status IN ('active', 'in_progress'))
      AND (s.tenant_id = NEW.tenant_id OR NEW.tenant_id IS NULL)
  ) THEN
    v_is_active := true;
  END IF;

  -- 2. Check tracker.projects.settings->'sprint_settings'->'sprints' as fallback
  IF NOT v_is_active AND NEW.project_id IS NOT NULL THEN
    SELECT 1 INTO v_found
    FROM tracker.projects p,
         jsonb_array_elements(COALESCE(p.settings->'sprint_settings'->'sprints', '[]'::jsonb)) elem
    WHERE p.id = NEW.project_id
      AND (elem->>'name' = v_sprint_name OR elem->>'id' = v_sprint_id)
      AND (
        (elem->>'is_active')::boolean = true
        OR elem->>'status' IN ('active', 'in_progress')
        OR (elem->>'is_current')::boolean = true
      )
    LIMIT 1;

    IF FOUND THEN
      v_is_active := true;
    END IF;
  END IF;

  -- If sprint is active, reject story_points revision with SQLSTATE 23514 (check_violation)
  IF v_is_active THEN
    RAISE EXCEPTION 'Estimates locked while sprint is active: cannot modify story_points on active sprint items'
      USING ERRCODE = '23514',
            DETAIL = 'Active sprint scope is frozen. Point revisions must occur prior to sprint activation.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to tracker.work_items
DROP TRIGGER IF EXISTS trg_prevent_point_drift_on_active_sprint ON tracker.work_items;
CREATE TRIGGER trg_prevent_point_drift_on_active_sprint
  BEFORE UPDATE OF metadata ON tracker.work_items
  FOR EACH ROW
  EXECUTE FUNCTION tracker.prevent_point_drift_on_active_sprint();

COMMIT;
