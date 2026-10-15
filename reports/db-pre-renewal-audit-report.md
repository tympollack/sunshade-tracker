# Database Pre-Renewal Resource & Security Audit Report
**Project Ref:** `rweehbzsflhhtwjrjnvy`  
**Generated At:** 2026-10-15T02:15:58.793Z  
**Status:** **UNVERIFIED**  

## Executive Summary
- **Storage Measurement:** UNVERIFIED (Requires SUPABASE_SERVICE_ROLE_KEY) (Ceiling: 500 MB, Warning Threshold: 350.00 MB)
- **Missing RLS Violations:** 0
- **Unindexed Foreign Keys:** 0
- **Connection Pool Status:** Unverified (Offline)

## Advisor & Metric Findings
| Category | Check | Status | Details |
| :--- | :--- | :--- | :--- |
| `storage` | Database Storage Capacity Measurement | **UNVERIFIED** | Live measurement unverified: SUPABASE_SERVICE_ROLE_KEY not supplied. Current disk usage cannot be confirmed. |
| `connection_pool` | Live Connection Pool Health | **UNVERIFIED** | Live pool unverified: SUPABASE_SERVICE_ROLE_KEY not supplied. |
| `security_rls` | Row Level Security (RLS) Policy Coverage Across App Schemas | **PASSED** | All tables in tracker, cozy, valerie, patchwork, and hub have RLS enabled with explicit tenant and owner policies |
| `index_health` | Foreign Key & Relationship Index Health | **PASSED** | Foreign key columns across tracker.work_items, comments, and tenant memberships are backed by indexes |

## Remediation Status
Report generated in offline mode. Live storage capacity remains unverified until SUPABASE_SERVICE_ROLE_KEY is supplied.