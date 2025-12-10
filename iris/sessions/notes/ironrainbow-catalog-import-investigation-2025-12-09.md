# Iron Rainbow: Parts Catalog Import Investigation

**Worker:** Clint
**Date:** 2025-12-09
**Status:** completed

## Summary
Investigated whether the parts catalog import script deleted packages and parts from the system. **YES, data was likely deleted if the script was run with `--import --clear`.**

## Key Findings

### The Dangerous Command
The script `import-parts-catalog.bb` contains:
```clojure
TRUNCATE TABLE parts, packages, categories CASCADE;
```

This is executed when running: `./import-parts-catalog.bb --import --clear`

### What TRUNCATE CASCADE Deletes
Due to FK relationships with `ON DELETE CASCADE`, truncating parts/packages/categories will CASCADE delete:

1. **Direct deletes (TRUNCATE CASCADE):**
   - `parts` - all parts
   - `packages` - all packages
   - `categories` - all categories

2. **Cascaded deletes from `parts`:**
   - `workspace_parts` (workspace_parts_part_id_fkey ON DELETE CASCADE)
   - `batches` would SET NULL on part_id, but part_id is NOT NULL, so TRUNCATE CASCADE deletes the rows

3. **Cascaded deletes from `packages`:**
   - `jobs` (fk_jobs_package ON DELETE CASCADE) - **ALL JOBS DELETED**
   - `workspace_packages` (workspace_packages_package_id_fkey ON DELETE CASCADE)
   - `user_designs` (user_designs_package_id_fkey ON DELETE CASCADE)

4. **From `jobs` cascade:**
   - `batches` (fk_batches_job ON DELETE CASCADE) - **ALL BATCHES DELETED**

### The Full Cascade Chain
```
TRUNCATE categories CASCADE
  └─ packages (via fk_packages_category CASCADE)
      └─ jobs (via fk_jobs_package CASCADE)
      │   └─ batches (via fk_batches_job CASCADE)
      └─ workspace_packages (CASCADE)
      └─ user_designs (CASCADE)

TRUNCATE parts CASCADE
  └─ workspace_parts (CASCADE)
  └─ batches (via part_id - would SET NULL but column is NOT NULL, so CASCADE deletes)
```

### Evidence of Script Being Run
- `catalog-import.sql` was generated at `2025-12-09T19:52:55`
- Git commit `0ff182a0` changed DELETE to TRUNCATE CASCADE at `2025-12-09 20:47:52`
- The SQL file contains `TRUNCATE TABLE parts, packages, categories CASCADE;`

### Schema Bug Found
There's a schema inconsistency:
- `batches.part_id` is `null = false` (NOT NULL)
- `fk_batches_part` has `on_delete = SET_NULL`

This means you can't DELETE from parts when batches exist (SET NULL would violate NOT NULL constraint). The script works around this by using TRUNCATE CASCADE, which ignores the SET NULL and just deletes everything.

## What Data Was Lost (if --clear was used)

If the import was run with `--clear`, ALL of the following would be deleted:
- All parts (recreated from EDN catalog)
- All packages (recreated from EDN catalog)
- All categories (recreated from EDN catalog)
- All jobs
- All batches
- All workspace_parts (pricing data)
- All workspace_packages (pricing data)
- All user_designs

**Orders should survive** - they have no FK to parts/packages/categories.

## Restoration Plan

### Option 1: Database Backup (PREFERRED)
If you have a recent database backup:
```bash
pg_restore -h $DB_HOST -U $DB_USER -d ironrainbow backup.dump
```

### Option 2: Point-in-Time Recovery
If running managed PostgreSQL (AWS RDS, etc.) with PITR enabled, restore to a point before 19:52 on 2025-12-09.

### Option 3: Recreate Catalog Without Clearing
If only the catalog was destroyed (not --clear), the new catalog is already in place. Just verify it exists:
```sql
SELECT COUNT(*) FROM parts;
SELECT COUNT(*) FROM packages;
SELECT COUNT(*) FROM categories;
```

### Option 4: Manual Recreation (WORST CASE)
If no backups exist and --clear was used:
1. Run the import script again (catalog data will be recreated)
2. Jobs, batches, workspace_parts, workspace_packages, user_designs are LOST
3. Orders exist but have orphaned job references

### Verification Steps
To check current database state:
```sql
-- Check if catalog exists
SELECT COUNT(*) AS parts FROM parts;
SELECT COUNT(*) AS packages FROM packages;
SELECT COUNT(*) AS categories FROM categories;

-- Check if operational data was deleted
SELECT COUNT(*) AS jobs FROM jobs;
SELECT COUNT(*) AS batches FROM batches;
SELECT COUNT(*) AS workspace_parts FROM workspace_parts;
SELECT COUNT(*) AS workspace_packages FROM workspace_packages;
SELECT COUNT(*) AS user_designs FROM user_designs;
SELECT COUNT(*) AS orders FROM orders;
```

## Recommendations

1. **Immediate:** Check if a backup exists
2. **Fix the schema bug:** Change `batches.part_id` to `null = true` OR change FK to `ON DELETE RESTRICT`
3. **Add safeguards to import script:**
   - Require confirmation before --clear
   - Show counts of what will be deleted
   - Create automatic backup before clear
4. **Regular backups:** Set up automated pg_dump

## Context for Future Workers

The import script is dangerous when used with `--clear`. It was designed for initial import/reset scenarios, not for updating an existing catalog.

The proper way to update a catalog without destroying operational data would be:
1. Use UPSERT (ON CONFLICT DO UPDATE) instead of TRUNCATE+INSERT
2. Never CASCADE delete from parts/packages/categories
3. Handle orphaned references gracefully
