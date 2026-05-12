use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
#[cfg(test)]
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacySummary {
    pub summary: String,
    pub decisions: Vec<String>,
    pub action_items: Vec<String>,
    pub questions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSession {
    pub id: String,
    pub title: String,
    pub mode: String,
    pub language: String,
    pub privacy_mode: String,
    pub provider: String,
    pub created_at: String,
    pub duration_seconds: i64,
    pub word_count: i64,
    pub raw_text: Option<String>,
    pub text: String,
    pub summary: Option<LegacySummary>,
}

pub fn init_database() -> Result<(), String> {
    let connection = open_connection()?;
    connection
        .execute_batch(
            r#"
            create table if not exists sessions (
              id text primary key,
              title text not null,
              mode text not null,
              language text not null,
              privacy_mode text not null,
              provider text not null,
              created_at text not null,
              duration_seconds integer not null,
              word_count integer not null,
              raw_text text,
              text text not null,
              summary_json text
            );

            create table if not exists settings (
              key text primary key,
              value_json text not null,
              updated_at text not null
            );

            create table if not exists dictionary_terms (
              id text primary key,
              value text not null,
              language text not null,
              created_at text not null
            );

            create table if not exists snippets (
              id text primary key,
              trigger text not null,
              replacement text not null,
              language text not null,
              created_at text not null
            );

            create table if not exists usage_events (
              id integer primary key autoincrement,
              session_id text,
              event text not null,
              duration_seconds integer not null default 0,
              word_count integer not null default 0,
              created_at text not null
            );
            "#,
        )
        .map_err(|error| error.to_string())?;
    let _ = connection.execute("alter table sessions add column raw_text text", []);
    Ok(())
}

#[tauri::command]
pub fn save_session(session: LocalSession) -> Result<(), String> {
    let connection = open_connection()?;
    let summary_json = session
        .summary
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            r#"
            insert into sessions
              (id, title, mode, language, privacy_mode, provider, created_at, duration_seconds, word_count, raw_text, text, summary_json)
            values
              (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            on conflict(id) do update set
              title = excluded.title,
              mode = excluded.mode,
              language = excluded.language,
              privacy_mode = excluded.privacy_mode,
              provider = excluded.provider,
              duration_seconds = excluded.duration_seconds,
              word_count = excluded.word_count,
              raw_text = excluded.raw_text,
              text = excluded.text,
              summary_json = excluded.summary_json
            "#,
            params![
                session.id,
                session.title,
                session.mode,
                session.language,
                session.privacy_mode,
                session.provider,
                session.created_at,
                session.duration_seconds,
                session.word_count,
                session.raw_text,
                session.text,
                summary_json
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_sessions() -> Result<Vec<LocalSession>, String> {
    let connection = open_connection()?;
    let mut statement = connection
        .prepare(
            r#"
            select id, title, mode, language, privacy_mode, provider, created_at,
                   duration_seconds, word_count, raw_text, text, summary_json
            from sessions
            order by created_at desc
            limit 100
            "#,
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let summary_json: Option<String> = row.get(11)?;
            let summary = summary_json
                .and_then(|value| serde_json::from_str::<LegacySummary>(&value).ok());

            Ok(LocalSession {
                id: row.get(0)?,
                title: row.get(1)?,
                mode: row.get(2)?,
                language: row.get(3)?,
                privacy_mode: row.get(4)?,
                provider: row.get(5)?,
                created_at: row.get(6)?,
                duration_seconds: row.get(7)?,
                word_count: row.get(8)?,
                raw_text: row.get(9)?,
                text: row.get(10)?,
                summary,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_sessions() -> Result<(), String> {
    let connection = open_connection()?;
    connection
        .execute("delete from sessions", [])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_session(session_id: String) -> Result<(), String> {
    let connection = open_connection()?;
    connection
        .execute("delete from sessions where id = ?1", params![session_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn open_connection() -> Result<Connection, String> {
    let path = database_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    Connection::open(path).map_err(|error| error.to_string())
}

fn database_path() -> Result<PathBuf, String> {
    #[cfg(test)]
    {
        if let Some(path) = env::var_os("DICTIVO_DB_PATH") {
            return Ok(PathBuf::from(path));
        }
    }

    let base = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .ok_or_else(|| "Unable to resolve local data directory".to_string())?;
    Ok(base.join("Dictivo").join("local.sqlite3"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_session(id: &str, created_at: &str) -> LocalSession {
        LocalSession {
            id: id.to_string(),
            title: format!("Message {id}"),
            mode: "message".to_string(),
            language: "en".to_string(),
            privacy_mode: "local-only".to_string(),
            provider: "local-whisper".to_string(),
            created_at: created_at.to_string(),
            duration_seconds: 3,
            word_count: 2,
            raw_text: Some(format!("raw {id}")),
            text: format!("final {id}"),
            summary: None,
        }
    }

    fn with_temp_database(test: impl FnOnce()) {
        let previous_path = env::var_os("DICTIVO_DB_PATH");
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let path = env::temp_dir().join(format!(
            "dictivo-storage-{}-{suffix}.sqlite3",
            std::process::id()
        ));

        env::set_var("DICTIVO_DB_PATH", &path);
        init_database().expect("test database should initialize");
        test();

        if let Some(value) = previous_path {
            env::set_var("DICTIVO_DB_PATH", value);
        } else {
            env::remove_var("DICTIVO_DB_PATH");
        }
        let _ = fs::remove_file(path);
    }

    #[test]
    fn deletes_single_session_and_clears_all_sessions() {
        with_temp_database(|| {
            save_session(make_session("session_old", "2026-05-11T10:00:00.000Z")).unwrap();
            save_session(make_session("session_new", "2026-05-11T11:00:00.000Z")).unwrap();

            let sessions = list_sessions().unwrap();
            assert_eq!(
                sessions
                    .iter()
                    .map(|session| session.id.as_str())
                    .collect::<Vec<_>>(),
                vec!["session_new", "session_old"]
            );

            delete_session("session_old".to_string()).unwrap();
            let sessions = list_sessions().unwrap();
            assert_eq!(
                sessions
                    .iter()
                    .map(|session| session.id.as_str())
                    .collect::<Vec<_>>(),
                vec!["session_new"]
            );

            clear_sessions().unwrap();
            assert!(list_sessions().unwrap().is_empty());
        });
    }
}
