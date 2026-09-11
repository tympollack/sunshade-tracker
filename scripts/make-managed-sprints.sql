-- ============================================================================
-- Sunshade Tracker: Convert Existing Sprints to Managed Sprints
--
-- Target Sprints:
--   • Sprint 2026-Q2: 2026-04-01 to 2026-06-30 | Status: completed
--   • Sprint 2026-Q3: 2026-07-01 to 2026-09-30 | Status: active (current focus)
--   • Sprint 2026-Q4: 2026-10-01 to 2026-12-31 | Status: planned
--
-- Features:
--   1. Fully idempotent — safe to re-run multiple times without duplicate entries.
--   2. Preserves existing sprint_settings keys, other configured sprints, and custom goals.
--   3. Normalizes informal/legacy sprint names on work items to canonical names.
--   4. Can be scoped to a single project or run across all active projects.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: Normalize any unmanaged/informal sprint names on active work items
-- ----------------------------------------------------------------------------
-- Normalizes variants like '2026-Q2', 'Q2 2026', '2026 Q2' to 'Sprint 2026-Q2'
UPDATE tracker.work_items
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{sprint}',
  '"Sprint 2026-Q2"'::jsonb
),
updated_at = NOW()
WHERE deleted_at IS NULL
  AND metadata->>'sprint' IN (
    '2026-Q2', 'Q2 2026', '2026 Q2', 'Sprint Q2 2026', 'sprint-2026-q2', 'q2-2026'
  );

-- Normalizes variants like '2026-Q3', 'Q3 2026', '2026 Q3' to 'Sprint 2026-Q3'
UPDATE tracker.work_items
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{sprint}',
  '"Sprint 2026-Q3"'::jsonb
),
updated_at = NOW()
WHERE deleted_at IS NULL
  AND metadata->>'sprint' IN (
    '2026-Q3', 'Q3 2026', '2026 Q3', 'Sprint Q3 2026', 'sprint-2026-q3', 'q3-2026'
  );

-- Normalizes variants like '2026-Q4', 'Q4 2026', '2026 Q4' to 'Sprint 2026-Q4'
UPDATE tracker.work_items
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{sprint}',
  '"Sprint 2026-Q4"'::jsonb
),
updated_at = NOW()
WHERE deleted_at IS NULL
  AND metadata->>'sprint' IN (
    '2026-Q4', 'Q4 2026', '2026 Q4', 'Sprint Q4 2026', 'sprint-2026-q4', 'q4-2026'
  );


-- ----------------------------------------------------------------------------
-- STEP 2: Upsert Managed Sprint Definitions into tracker.projects.settings
-- ----------------------------------------------------------------------------
UPDATE tracker.projects p
SET settings = COALESCE(p.settings, '{}'::jsonb) || jsonb_build_object(
  'sprint_settings',
  COALESCE(p.settings->'sprint_settings', '{}'::jsonb) || jsonb_build_object(
    'default_sprint', COALESCE(p.settings->'sprint_settings'->>'default_sprint', 'current'),
    'sprints', (
      -- 1. Keep any existing sprints NOT in ('Sprint 2026-Q2', 'Sprint 2026-Q3', 'Sprint 2026-Q4')
      COALESCE(
        (
          SELECT jsonb_agg(elem)
          FROM jsonb_array_elements(COALESCE(p.settings->'sprint_settings'->'sprints', '[]'::jsonb)) elem
          WHERE elem->>'name' NOT IN ('Sprint 2026-Q2', 'Sprint 2026-Q3', 'Sprint 2026-Q4')
        ),
        '[]'::jsonb
      )
      ||
      -- 2. Append the 3 target managed sprints (preserving existing id/goal if previously set)
      jsonb_build_array(
        jsonb_build_object(
          'id', COALESCE(
            (
              SELECT elem->>'id'
              FROM jsonb_array_elements(COALESCE(p.settings->'sprint_settings'->'sprints', '[]'::jsonb)) elem
              WHERE elem->>'name' = 'Sprint 2026-Q2'
              LIMIT 1
            ),
            'sprint-2026-q2'
          ),
          'name', 'Sprint 2026-Q2',
          'start_date', '2026-04-01',
          'end_date', '2026-06-30',
          'goal', (
            SELECT elem->>'goal'
            FROM jsonb_array_elements(COALESCE(p.settings->'sprint_settings'->'sprints', '[]'::jsonb)) elem
            WHERE elem->>'name' = 'Sprint 2026-Q2'
            LIMIT 1
          ),
          'status', 'completed',
          'is_current', false
        ),
        jsonb_build_object(
          'id', COALESCE(
            (
              SELECT elem->>'id'
              FROM jsonb_array_elements(COALESCE(p.settings->'sprint_settings'->'sprints', '[]'::jsonb)) elem
              WHERE elem->>'name' = 'Sprint 2026-Q3'
              LIMIT 1
            ),
            'sprint-2026-q3'
          ),
          'name', 'Sprint 2026-Q3',
          'start_date', '2026-07-01',
          'end_date', '2026-09-30',
          'goal', (
            SELECT elem->>'goal'
            FROM jsonb_array_elements(COALESCE(p.settings->'sprint_settings'->'sprints', '[]'::jsonb)) elem
            WHERE elem->>'name' = 'Sprint 2026-Q3'
            LIMIT 1
          ),
          'status', 'active',
          'is_current', true
        ),
        jsonb_build_object(
          'id', COALESCE(
            (
              SELECT elem->>'id'
              FROM jsonb_array_elements(COALESCE(p.settings->'sprint_settings'->'sprints', '[]'::jsonb)) elem
              WHERE elem->>'name' = 'Sprint 2026-Q4'
              LIMIT 1
            ),
            'sprint-2026-q4'
          ),
          'name', 'Sprint 2026-Q4',
          'start_date', '2026-10-01',
          'end_date', '2026-12-31',
          'goal', (
            SELECT elem->>'goal'
            FROM jsonb_array_elements(COALESCE(p.settings->'sprint_settings'->'sprints', '[]'::jsonb)) elem
            WHERE elem->>'name' = 'Sprint 2026-Q4'
            LIMIT 1
          ),
          'status', 'planned',
          'is_current', false
        )
      )
    )
  )
),
updated_at = NOW()
WHERE p.deleted_at IS NULL;
-- NOTE: To restrict this to a specific project or workspace, uncomment and customize:
--   AND p.slug = 'tracker'
--   AND p.tenant_id = (SELECT id FROM tracker.tenants WHERE slug = 'sunshade' LIMIT 1);


-- ----------------------------------------------------------------------------
-- STEP 3: Verification Queries
-- ----------------------------------------------------------------------------

-- Check updated sprint definitions in project settings:
SELECT
  p.id AS project_id,
  p.slug AS project_slug,
  p.name AS project_name,
  jsonb_pretty(p.settings->'sprint_settings') AS sprint_settings
FROM tracker.projects p
WHERE p.deleted_at IS NULL;

-- Check work items mapped to the new managed sprints:
SELECT
  w.project_id,
  w.metadata->>'sprint' AS sprint_name,
  COUNT(*) AS item_count
FROM tracker.work_items w
WHERE w.deleted_at IS NULL
  AND w.metadata->>'sprint' IN ('Sprint 2026-Q2', 'Sprint 2026-Q3', 'Sprint 2026-Q4')
GROUP BY w.project_id, w.metadata->>'sprint'
ORDER BY sprint_name;

COMMIT;
