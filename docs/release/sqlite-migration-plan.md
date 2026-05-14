# SQLite Schema Migration Plan

> Internal-beta users have been writing into `local.sqlite3` since 0.1.x. Their dictation history, dictionary entries, and snippet library matter. The migration policy below is non-negotiable for every commit that touches `apps/desktop/src-tauri/src/storage.rs`.

## Current state (as of 0.2.1)

```
sessions          (id, title, mode, language, privacy_mode, provider,
                   created_at, duration_seconds, word_count,
                   raw_text, text, summary_json)
settings          (key, value_json, updated_at)
dictionary_terms  (... see storage.rs)
snippets          (... see storage.rs)
```

All four tables use `CREATE TABLE IF NOT EXISTS` so re-opening an old database against the current binary is forward-compatible **as long as no column is dropped or renamed**.

There is currently **no `schema_version` table**. The migration plan adds one.

## The rules

1. **Never drop or rename a column.** Add new columns with `ALTER TABLE ... ADD COLUMN` (always nullable / with a default), or add new tables. Old binaries reading new databases will simply ignore unknown columns, which is acceptable since downgrade is not a documented path but should not corrupt anything.

2. **Never drop a table.** Same reason.

3. **Every schema change goes through a migration step.** No hand-edited `CREATE TABLE` strings — always a migration that records its application in `schema_version`.

4. **Migrations are forward-only.** No rollback paths. If a migration is wrong, the next migration fixes the data; the broken state never has to be undone.

5. **A migration that fails must leave the database in its previous state.** Wrap migration work in a transaction.

## The migration infrastructure (to be added in 0.2.2 — not landed yet)

```rust
// apps/desktop/src-tauri/src/storage.rs (sketch)

const MIGRATIONS: &[Migration] = &[
    Migration {
        id: 1,
        name: "initial_schema",
        sql: include_str!("migrations/001_initial.sql"),
    },
    // Migration { id: 2, name: "add_session_tags", sql: ... },
];

fn ensure_schema(connection: &Connection) -> Result<(), String> {
    connection.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY,
            name TEXT NOT NULL, applied_at TEXT NOT NULL)",
        [],
    )?;
    let applied: HashSet<i64> = connection
        .prepare("SELECT id FROM schema_version")?
        .query_map([], |row| row.get::<_, i64>(0))?
        .filter_map(Result::ok)
        .collect();
    for migration in MIGRATIONS {
        if applied.contains(&migration.id) { continue; }
        let tx = connection.transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.execute(
            "INSERT INTO schema_version (id, name, applied_at) VALUES (?, ?, ?)",
            params![migration.id, migration.name, OffsetDateTime::now_utc().to_string()],
        )?;
        tx.commit()?;
    }
    Ok(())
}
```

`init_database()` becomes a thin wrapper over `ensure_schema()`. The first migration `001_initial.sql` mirrors today's `CREATE TABLE IF NOT EXISTS` block verbatim, so internal users on existing 0.2.x databases get a single `INSERT INTO schema_version` row added on first launch under the new code (no data movement, no risk).

## Cutting a new migration

When schema changes are needed:

1. Bump the patch version per `versioning.md`.
2. Create `apps/desktop/src-tauri/src/migrations/00N_short_name.sql`.
3. Add a `Migration { id: N, name: "short_name", sql: include_str!(...) }` to `MIGRATIONS`.
4. Add a unit test in `storage.rs::tests` that:
   - Creates an empty database, runs migrations up to `N-1`, asserts the pre-state
   - Runs migration `N`, asserts the post-state
   - Re-runs `ensure_schema()` and asserts idempotency
5. Write a one-line note in `CHANGELOG.md` (when it exists) describing what users see / don't see.

## What never goes into a migration

- User-content cleanup ("delete history older than 90 days") — this is the user's data, never auto-mutate.
- Re-encryption or "upgrade your stored format" — if a future Dictivo version wants to encrypt the local DB, that's a major-version product feature, not a migration.
- Server-side state — there is none. Migrations are strictly per-user-machine.

## Pre-launch action item (before v1.0.0)

- [ ] Land the migration infrastructure above as a single PR at 0.2.2 or earlier.
- [ ] Verify against a saved `local.sqlite3` from a 0.1.x build.
- [ ] Document in `eula-and-privacy.md` (and the public privacy page) that "your local SQLite database is migrated forward-only and never moved off your machine."

Once shipped, future schema changes are routine. The infrastructure pays for itself the first time we want to add a single column without nervousness.
