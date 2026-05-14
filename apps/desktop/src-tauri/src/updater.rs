//! Update orchestration.
//!
//! Thin wrapper around `tauri-plugin-updater`. The plugin handles fetching the
//! manifest, signature verification (minisign / Ed25519), download, and
//! installer invocation. This module adds:
//!
//! 1. A client-side update-window gate that hides newer builds from users
//!    whose 12-month entitlement has lapsed (perpetual-fallback friendly:
//!    the app keeps running, just stops offering updates).
//! 2. A simple JSON event payload the React banner can listen for.
//! 3. A Tauri command frontends call to trigger a manual check.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;
use time::OffsetDateTime;

use crate::license;

const EVENT_UPDATE_AVAILABLE: &str = "dictivo://update-available";
const EVENT_UPDATE_WINDOW_EXPIRED: &str = "dictivo://update-window-expired";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub pub_date: String,
    pub notes: String,
    pub window_blocked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub kind: CheckResultKind,
    pub info: Option<UpdateInfo>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CheckResultKind {
    /// A new build is available and the user's update window covers it.
    Available,
    /// A new build exists, but the user's update window has lapsed. We do not
    /// surface this build for install but we *do* tell the UI so it can offer
    /// a renewal CTA.
    WindowExpired,
    /// The app is already on the latest build.
    UpToDate,
    /// Update check failed (offline, server down, etc.). The error is logged
    /// but never surfaced to the user as a modal.
    Failed,
}

/// Check for an update and emit events the frontend listens to. Safe to call
/// from a background task; never panics, never blocks.
pub async fn check_and_notify(app: &AppHandle) -> CheckResult {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            return CheckResult {
                kind: CheckResultKind::Failed,
                info: None,
                error: Some(format!("Updater plugin unavailable: {e}")),
            };
        }
    };

    let check = match updater.check().await {
        Ok(value) => value,
        Err(e) => {
            return CheckResult {
                kind: CheckResultKind::Failed,
                info: None,
                error: Some(format!("Update check failed: {e}")),
            };
        }
    };

    let Some(update) = check else {
        return CheckResult {
            kind: CheckResultKind::UpToDate,
            info: None,
            error: None,
        };
    };

    let pub_date_iso = update
        .date
        .and_then(|d| {
            d.format(&time::format_description::well_known::Rfc3339)
                .ok()
        })
        .unwrap_or_default();

    let within_window = is_within_update_window(&pub_date_iso);
    let info = UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        pub_date: pub_date_iso,
        notes: update.body.unwrap_or_default(),
        window_blocked: !within_window,
    };

    if within_window {
        let _ = app.emit(EVENT_UPDATE_AVAILABLE, &info);
        CheckResult {
            kind: CheckResultKind::Available,
            info: Some(info),
            error: None,
        }
    } else {
        let _ = app.emit(EVENT_UPDATE_WINDOW_EXPIRED, &info);
        CheckResult {
            kind: CheckResultKind::WindowExpired,
            info: Some(info),
            error: None,
        }
    }
}

/// Returns true if the build's publication date is within the user's update
/// entitlement window (or if no license is present — pre-purchase users may
/// receive the latest stable build the freemium tier is entitled to).
fn is_within_update_window(pub_date_iso: &str) -> bool {
    let Some(pub_date) =
        OffsetDateTime::parse(pub_date_iso, &time::format_description::well_known::Rfc3339).ok()
    else {
        // If we can't parse the build's pub_date, default to "allow". A
        // malformed manifest is the publisher's problem to fix, not the
        // user's to be blocked by.
        return true;
    };

    match license::cached_updates_until() {
        Some(updates_until) => pub_date <= updates_until,
        // No license cached → freemium / trial / unactivated. Allow updates.
        None => true,
    }
}

#[tauri::command]
pub async fn updater_check_now(app: AppHandle) -> Result<CheckResult, String> {
    Ok(check_and_notify(&app).await)
}

/// Download + install the update reported by the most recent check. Used by
/// the React banner's "Install on quit" action.
#[tauri::command]
pub async fn updater_install(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("Update check failed: {e}"))?
        .ok_or_else(|| "No update is currently available.".to_string())?;

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| format!("Install failed: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_pub_date_does_not_gate() {
        // No license cached + unparseable date → permissive.
        assert!(is_within_update_window("not-a-date"));
    }
}
