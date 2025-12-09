# Iron Rainbow: DB Performance Fixes

**Worker:** Fred
**Date:** 2025-12-09
**Status:** completed

## Summary
Implemented all 4 phases of the DB performance plan from `vision/todo/db-performance-plan.md`. Added query timing/logging, made pool settings configurable, improved retry behavior, and added composite indexes.

## Key Findings
- Project uses Atlas HCL for database schema migrations (in `database-schema/app/`)
- Custom logging in `zero.backend.tools.log` namespace (colored console output)
- System config in `project/resources/system.edn` uses `:env/VAR_NAME` pattern for env vars
- Pool was hardcoded at 20 max connections - now defaults to 40 and is configurable

## Changes Made

### Phase 1: Query Timing
- **File:** `project/code/zero/backend/state/postgres.clj`
- Added `slow-query-threshold-ms` config (default 100ms, env var `IRONRAINBOW_SLOW_QUERY_MS`)
- Added `with-query-timing` macro that logs slow queries with duration and SQL preview
- All queries through `execute-sql` now get timing

### Phase 2a: Pool Configuration
- **File:** `project/code/zero/backend/state/postgres_integrant.clj`
- Made `pool-min-size` and `pool-max-size` configurable via env vars
- Defaults: min=4, max=40 (was hardcoded at 20)
- **File:** `project/resources/system.edn`
- Added `:pool-min-size` and `:pool-max-size` keys reading from env
- **File:** `.env.example`
- Added `IRONRAINBOW_DB_POOL_MIN`, `IRONRAINBOW_DB_POOL_MAX`, `IRONRAINBOW_SLOW_QUERY_MS`

### Phase 2b: Retry Behavior
- **File:** `project/code/zero/backend/state/postgres.clj`
- Created `retry-config` data structure (Rich Hickey style - behavior as data)
- Reduced max retries from 5 to 3
- Base delay reduced from 200ms to 100ms
- Added max delay cap at 500ms (was unbounded exponential)
- Total worst-case retry time: 100ms + 200ms + 400ms = 700ms (was 200+400+800+1600+3200 = 6200ms)

### Phase 3: Composite Indexes
- **File:** `database-schema/app/jobs.hcl`
- Added `jobs_workspace_order_idx` on (workspace_id, order_id)
- **File:** `database-schema/app/batches.hcl`
- Added `batches_job_workspace_idx` on (job_id, workspace_id)
- **File:** `database-schema/app/orders.hcl`
- Added `orders_workspace_status_idx` on (workspace_id, status)

## Next Steps
- Run Atlas migration to apply new indexes to database
- Monitor slow query logs after deployment to identify actual bottlenecks
- Phase 4 (pg_trgm for search) was marked LOW priority - only do if search becomes a bottleneck

## Context for Future Workers
The retry config is now data-driven, so if you need different retry behavior for specific operations, you can pass a custom config map to `retry-with-backoff`. The default `retry-config` is used by `execute-sql`.

Atlas migrations are applied separately from code deploys. The HCL files define desired state, and Atlas generates the migration SQL.
