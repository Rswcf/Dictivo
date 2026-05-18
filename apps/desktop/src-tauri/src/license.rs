//! License storage + Lemon Squeezy activation.
//!
//! Design: licenses are activated once against Lemon Squeezy's REST API. After
//! activation the license is cached locally in a JSON file and the app never
//! requires another network call to keep functioning. This honors the
//! "perpetual fallback" promise — the cached license remains trusted forever.
//!
//! The 12-month update window is derived locally: `updates_until =
//! purchased_at + 365 days`. Update gating compares the build's `pub_date`
//! against `updates_until`; nothing about it requires a server check.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use time::{Duration, OffsetDateTime};

const LEMON_SQUEEZY_ACTIVATE_URL: &str = "https://api.lemonsqueezy.com/v1/licenses/activate";
const LEMON_SQUEEZY_VALIDATE_URL: &str = "https://api.lemonsqueezy.com/v1/licenses/validate";
const LEMON_SQUEEZY_DEACTIVATE_URL: &str = "https://api.lemonsqueezy.com/v1/licenses/deactivate";

const UPDATE_WINDOW_DAYS: i64 = 365;
const HTTP_TIMEOUT_SECS: u64 = 12;

#[derive(Debug, Clone, Copy)]
enum LicenseSlot {
    Local,
    CloudFast,
}

impl LicenseSlot {
    fn filename(self) -> &'static str {
        match self {
            Self::Local => "license.json",
            Self::CloudFast => "cloud-fast-license.json",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct License {
    pub license_key: String,
    pub instance_id: String,
    pub instance_name: String,
    pub customer_email: String,
    pub customer_name: String,
    pub order_id: String,
    pub product_name: String,
    pub variant_name: String,
    /// ISO-8601, UTC. Comes from LS `license_key.created_at`.
    pub created_at: String,
    /// ISO-8601, UTC. `created_at + 365 days`. Cached for display; recomputed on read.
    pub updates_until: String,
    /// LS license status. We mostly care about `active` vs anything else.
    pub status: String,
    /// When this cached copy was last refreshed from LS, ISO-8601 UTC. May be
    /// the same as the activation moment for never-refreshed licenses.
    pub last_refreshed_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseSummary {
    pub present: bool,
    pub email: String,
    pub product_name: String,
    pub created_at: String,
    pub updates_until: String,
    pub days_remaining: i64,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFastSessionResponse {
    pub token: String,
    pub token_type: String,
    pub user_id: String,
    pub expires_at: String,
    pub plan: String,
    pub available: bool,
    pub price_usd_monthly: String,
    pub monthly_seconds_limit: i64,
    pub monthly_seconds_used: i64,
    pub renews_at: Option<String>,
    pub upgrade_url: Option<String>,
    pub privacy_notice: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CloudFastSessionRequest<'a> {
    license_key: &'a str,
    instance_id: &'a str,
}

impl LicenseSummary {
    fn absent() -> Self {
        Self {
            present: false,
            email: String::new(),
            product_name: String::new(),
            created_at: String::new(),
            updates_until: String::new(),
            days_remaining: 0,
            status: "absent".to_string(),
        }
    }
}

#[tauri::command]
pub async fn license_activate(
    license_key: String,
    instance_name: String,
) -> Result<LicenseSummary, String> {
    activate_license_in_slot(license_key, instance_name, LicenseSlot::Local).await
}

#[tauri::command]
pub async fn license_cloud_fast_activate(
    license_key: String,
    instance_name: String,
) -> Result<LicenseSummary, String> {
    activate_license_in_slot(license_key, instance_name, LicenseSlot::CloudFast).await
}

async fn activate_license_in_slot(
    license_key: String,
    instance_name: String,
    slot: LicenseSlot,
) -> Result<LicenseSummary, String> {
    let trimmed = license_key.trim();
    if trimmed.is_empty() {
        return Err("License key is empty.".to_string());
    }

    let response = ls_post(
        LEMON_SQUEEZY_ACTIVATE_URL,
        &[("license_key", trimmed), ("instance_name", &instance_name)],
    )
    .await?;

    let license = build_license_from_response(&response, trimmed)?;
    if !license_matches_slot(slot, &license) {
        deactivate_remote_license_instance(&license).await;
        return Err(slot_mismatch_message(slot).to_string());
    }
    save_license(slot, &license)?;
    Ok(summarize(&license))
}

#[tauri::command]
pub fn license_get() -> Result<LicenseSummary, String> {
    get_license_summary(LicenseSlot::Local)
}

#[tauri::command]
pub fn license_cloud_fast_get() -> Result<LicenseSummary, String> {
    get_license_summary(LicenseSlot::CloudFast)
}

#[tauri::command]
pub fn license_cloud_fast_migrate_from_local() -> Result<LicenseSummary, String> {
    let Some(license) = load_license(LicenseSlot::Local)? else {
        return Err("No local license is available to move.".to_string());
    };
    if !license_is_cloud_fast(&license) {
        return Err("The saved local license is not a Cloud Fast license.".to_string());
    }

    save_license(LicenseSlot::CloudFast, &license)?;
    remove_license_cache(LicenseSlot::Local);
    Ok(summarize(&license))
}

fn get_license_summary(slot: LicenseSlot) -> Result<LicenseSummary, String> {
    match load_license(slot)? {
        Some(license) => Ok(summarize(&license)),
        None => Ok(LicenseSummary::absent()),
    }
}

/// Validate the cached license against LS. Returns a fresh summary. If the
/// network is down we deliberately return the cached summary without error —
/// the app is allowed to keep working offline indefinitely.
#[tauri::command]
pub async fn license_refresh() -> Result<LicenseSummary, String> {
    refresh_license_in_slot(LicenseSlot::Local).await
}

#[tauri::command]
pub async fn license_cloud_fast_refresh() -> Result<LicenseSummary, String> {
    refresh_license_in_slot(LicenseSlot::CloudFast).await
}

async fn refresh_license_in_slot(slot: LicenseSlot) -> Result<LicenseSummary, String> {
    let Some(mut license) = load_license(slot)? else {
        return Ok(LicenseSummary::absent());
    };

    let response = match ls_post(
        LEMON_SQUEEZY_VALIDATE_URL,
        &[
            ("license_key", license.license_key.as_str()),
            ("instance_id", license.instance_id.as_str()),
        ],
    )
    .await
    {
        Ok(value) => value,
        Err(_offline_or_unauthorized) => return Ok(summarize(&license)),
    };

    if let Some(status) = response
        .get("license_key")
        .and_then(|v| v.get("status"))
        .and_then(|v| v.as_str())
    {
        license.status = status.to_string();
    }
    license.last_refreshed_at = now_iso();
    save_license(slot, &license)?;
    Ok(summarize(&license))
}

#[tauri::command]
pub async fn license_cloud_fast_session(
    api_base_url: String,
) -> Result<CloudFastSessionResponse, String> {
    let Some(license) = load_license(LicenseSlot::CloudFast)? else {
        return Err("Activate your Cloud Fast license before using Cloud Fast.".to_string());
    };
    if license.instance_id.trim().is_empty() || license.license_key.trim().is_empty() {
        return Err("Your cached license is missing activation details. Reactivate the license and try Cloud Fast again.".to_string());
    }

    let base = api_base_url.trim().trim_end_matches('/');
    if !(base.starts_with("https://")
        || base.starts_with("http://localhost")
        || base.starts_with("http://127.0.0.1"))
    {
        return Err("Cloud Fast API URL must use HTTPS.".to_string());
    }

    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent("Dictivo-CloudFast/1.0")
        .build()
        .map_err(|_| {
            "Unable to start Cloud Fast license check. Please restart Dictivo.".to_string()
        })?
        .post(format!("{base}/v1/cloud-fast/session"))
        .header("Accept", "application/json")
        .json(&CloudFastSessionRequest {
            license_key: license.license_key.as_str(),
            instance_id: license.instance_id.as_str(),
        })
        .send()
        .await
        .map_err(|e| friendly_cloud_fast_network_error(e))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "Cloud Fast returned an unexpected license response.".to_string())?;

    if !status.is_success() {
        let message = body
            .get("message")
            .and_then(|v| v.as_str())
            .or_else(|| body.get("error").and_then(|v| v.as_str()))
            .unwrap_or("Cloud Fast license check failed.");
        return Err(message.to_string());
    }

    serde_json::from_value(body)
        .map_err(|_| "Cloud Fast returned an incomplete license session.".to_string())
}

#[tauri::command]
pub async fn license_deactivate() -> Result<(), String> {
    deactivate_license_in_slot(LicenseSlot::Local).await
}

#[tauri::command]
pub async fn license_cloud_fast_deactivate() -> Result<(), String> {
    deactivate_license_in_slot(LicenseSlot::CloudFast).await
}

async fn deactivate_license_in_slot(slot: LicenseSlot) -> Result<(), String> {
    let Some(license) = load_license(slot)? else {
        return Ok(());
    };

    // Best-effort remote deactivation. We always delete locally afterwards so
    // the user is never stuck with a stale local state.
    deactivate_remote_license_instance(&license).await;
    remove_license_cache(slot);
    Ok(())
}

/// Returns `Some(updates_until)` as an OffsetDateTime if a license is cached,
/// otherwise `None`. The updater module uses this to decide whether to surface
/// new builds to the user.
pub fn cached_updates_until() -> Option<OffsetDateTime> {
    let license = load_license(LicenseSlot::Local).ok().flatten()?;
    parse_iso(&license.updates_until)
}

// ---------- internals ----------

async fn ls_post(url: &str, form: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent("Dictivo-License/1.0")
        .build()
        .map_err(|_| "Unable to start license check. Please restart Dictivo.".to_string())?;

    let response = client
        .post(url)
        .header("Accept", "application/json")
        .form(form)
        .send()
        .await
        .map_err(|e| friendly_network_error(e))?;

    let status = response.status();
    let body: serde_json::Value = response.json().await.map_err(|_| {
        "Lemon Squeezy returned an unexpected response. Try again in a moment.".to_string()
    })?;

    if !status.is_success() {
        let raw = body.get("error").and_then(|v| v.as_str()).unwrap_or("");
        return Err(friendly_activation_error(status.as_u16(), raw));
    }
    Ok(body)
}

/// Map reqwest's verbose network error into something an end user can act on.
/// We deliberately don't expose the raw `reqwest::Error` text — it's full of
/// internal terms ("Connection reset", "dns error: failed to lookup address")
/// that scare users without telling them what to do.
fn friendly_network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "License server didn't respond in time. Check your internet connection and try again."
            .to_string()
    } else if error.is_connect() || error.is_request() {
        "Couldn't reach the license server. Check your internet connection and try again."
            .to_string()
    } else {
        "Network error while contacting the license server. Try again in a moment.".to_string()
    }
}

fn friendly_cloud_fast_network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Cloud Fast license check timed out. Try again in a moment.".to_string()
    } else if error.is_connect() || error.is_request() {
        "Couldn't reach the Cloud Fast service. Check your internet connection and try again."
            .to_string()
    } else {
        "Network error while checking Cloud Fast access. Try again in a moment.".to_string()
    }
}

/// Map known Lemon Squeezy error responses to user-friendly text. The full
/// list of error strings is at https://docs.lemonsqueezy.com/api/license-api ;
/// we cover the ones a real customer is most likely to hit.
fn friendly_activation_error(status: u16, raw: &str) -> String {
    let lowered = raw.to_lowercase();
    if lowered.contains("license_key_not_found") || lowered.contains("not found") {
        return "This license key wasn't recognized. Double-check the key in your purchase email, or contact hello@dictivo.app.".to_string();
    }
    if lowered.contains("activation_limit") {
        return "This license is already active on the maximum number of devices. Open Settings → License on one of your other devices and click 'Remove from this device', then activate here.".to_string();
    }
    if lowered.contains("license_key_disabled") || lowered.contains("disabled") {
        return "This license has been disabled (refunded or revoked). Contact hello@dictivo.app if you believe this is a mistake.".to_string();
    }
    if status == 401 || status == 403 {
        return "Lemon Squeezy rejected this activation request. Please try again or contact hello@dictivo.app.".to_string();
    }
    if !raw.is_empty() {
        return format!("Activation failed: {raw}");
    }
    "Activation failed. Please double-check the license key and try again.".to_string()
}

fn build_license_from_response(
    response: &serde_json::Value,
    license_key: &str,
) -> Result<License, String> {
    let activated = response
        .get("activated")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !activated {
        let message = response
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("License was not activated. Verify the key and try again.");
        return Err(message.to_string());
    }

    let instance = response
        .get("instance")
        .ok_or_else(|| "License response missing instance details.".to_string())?;
    let license_node = response
        .get("license_key")
        .ok_or_else(|| "License response missing license_key details.".to_string())?;
    let meta = response.get("meta");

    let created_at = license_node
        .get("created_at")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "License response missing created_at.".to_string())?
        .to_string();

    let updates_until = compute_updates_until(&created_at)?;

    Ok(License {
        license_key: license_key.to_string(),
        instance_id: instance
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        instance_name: instance
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        customer_email: meta
            .and_then(|m| m.get("customer_email"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        customer_name: meta
            .and_then(|m| m.get("customer_name"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        order_id: meta
            .and_then(|m| m.get("order_id"))
            .map(|v| v.to_string())
            .unwrap_or_default(),
        product_name: meta
            .and_then(|m| m.get("product_name"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        variant_name: meta
            .and_then(|m| m.get("variant_name"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        created_at,
        updates_until,
        status: license_node
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("active")
            .to_string(),
        last_refreshed_at: now_iso(),
    })
}

fn compute_updates_until(created_at: &str) -> Result<String, String> {
    let purchased = parse_iso(created_at)
        .ok_or_else(|| format!("Could not parse license created_at timestamp ({created_at})."))?;
    let updates_until = purchased + Duration::days(UPDATE_WINDOW_DAYS);
    Ok(format_iso(updates_until))
}

fn summarize(license: &License) -> LicenseSummary {
    let updates_until = parse_iso(&license.updates_until);
    let days_remaining = updates_until
        .map(|t| (t - OffsetDateTime::now_utc()).whole_days())
        .unwrap_or(0);
    LicenseSummary {
        present: true,
        email: license.customer_email.clone(),
        product_name: license.product_name.clone(),
        created_at: license.created_at.clone(),
        updates_until: license.updates_until.clone(),
        days_remaining,
        status: license.status.clone(),
    }
}

fn license_matches_slot(slot: LicenseSlot, license: &License) -> bool {
    match slot {
        LicenseSlot::Local => !license_is_cloud_fast(license),
        LicenseSlot::CloudFast => license_is_cloud_fast(license),
    }
}

fn license_is_cloud_fast(license: &License) -> bool {
    let combined = format!("{} {}", license.product_name, license.variant_name);
    let compact = combined
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase();
    compact.contains("cloudfast")
}

fn slot_mismatch_message(slot: LicenseSlot) -> &'static str {
    match slot {
        LicenseSlot::Local => {
            "This is a Cloud Fast license. Activate it in Settings > License & Updates > Cloud Fast license instead."
        }
        LicenseSlot::CloudFast => "This license does not include Cloud Fast.",
    }
}

async fn deactivate_remote_license_instance(license: &License) {
    let _ = ls_post(
        LEMON_SQUEEZY_DEACTIVATE_URL,
        &[
            ("license_key", license.license_key.as_str()),
            ("instance_id", license.instance_id.as_str()),
        ],
    )
    .await;
}

fn remove_license_cache(slot: LicenseSlot) {
    if let Ok(path) = license_path(slot) {
        let _ = fs::remove_file(path);
    }
}

fn parse_iso(value: &str) -> Option<OffsetDateTime> {
    OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339).ok()
}

fn format_iso(value: OffsetDateTime) -> String {
    value
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}

fn now_iso() -> String {
    format_iso(OffsetDateTime::now_utc())
}

fn license_path(slot: LicenseSlot) -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .ok_or_else(|| "Unable to resolve local data directory.".to_string())?;
    Ok(base.join("Dictivo").join(slot.filename()))
}

fn save_license(slot: LicenseSlot, license: &License) -> Result<(), String> {
    let path = license_path(slot)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let payload = serde_json::to_vec_pretty(license).map_err(|e| e.to_string())?;
    fs::write(&path, payload).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_license(slot: LicenseSlot) -> Result<Option<License>, String> {
    let path = license_path(slot)?;
    if !path.exists() {
        return Ok(None);
    }
    let payload = fs::read(&path).map_err(|e| e.to_string())?;
    let license: License =
        serde_json::from_slice(&payload).map_err(|e| format!("Corrupt license cache: {e}"))?;
    Ok(Some(license))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updates_until_is_365_days_after_purchase() {
        let purchased = "2026-05-14T10:00:00Z";
        let computed = compute_updates_until(purchased).unwrap();
        let parsed = parse_iso(&computed).unwrap();
        let expected = parse_iso(purchased).unwrap() + Duration::days(365);
        assert_eq!(parsed, expected);
    }

    #[test]
    fn updates_until_rejects_malformed_timestamp() {
        assert!(compute_updates_until("not-a-date").is_err());
    }

    #[test]
    fn absent_summary_marks_present_false() {
        let summary = LicenseSummary::absent();
        assert!(!summary.present);
        assert_eq!(summary.status, "absent");
        assert_eq!(summary.days_remaining, 0);
    }

    #[test]
    fn license_slots_use_distinct_cache_files() {
        assert_eq!(LicenseSlot::Local.filename(), "license.json");
        assert_eq!(LicenseSlot::CloudFast.filename(), "cloud-fast-license.json");
    }

    #[test]
    fn license_slots_reject_mismatched_cloud_fast_products() {
        let mut license = test_license();
        license.product_name = "Dictivo Cloud Fast".to_string();
        assert!(license_is_cloud_fast(&license));
        assert!(!license_matches_slot(LicenseSlot::Local, &license));
        assert!(license_matches_slot(LicenseSlot::CloudFast, &license));

        license.product_name = "Dictivo Local".to_string();
        license.variant_name = "Personal".to_string();
        assert!(!license_is_cloud_fast(&license));
        assert!(license_matches_slot(LicenseSlot::Local, &license));
        assert!(!license_matches_slot(LicenseSlot::CloudFast, &license));
    }

    #[test]
    fn build_license_extracts_known_fields() {
        let response = serde_json::json!({
            "activated": true,
            "instance": { "id": "inst-1", "name": "Alice's MacBook" },
            "license_key": {
                "status": "active",
                "created_at": "2026-05-14T10:00:00Z"
            },
            "meta": {
                "customer_email": "alice@example.com",
                "customer_name": "Alice Chen",
                "order_id": 12345,
                "product_name": "Dictivo",
                "variant_name": "Personal"
            }
        });
        let license = build_license_from_response(&response, "KEY-1234").unwrap();
        assert_eq!(license.license_key, "KEY-1234");
        assert_eq!(license.instance_id, "inst-1");
        assert_eq!(license.customer_email, "alice@example.com");
        assert_eq!(license.status, "active");
        let updates_until = parse_iso(&license.updates_until).unwrap();
        let purchased = parse_iso(&license.created_at).unwrap();
        assert_eq!(updates_until - purchased, Duration::days(365));
    }

    #[test]
    fn build_license_rejects_inactive_response() {
        let response = serde_json::json!({
            "activated": false,
            "error": "license_key_not_found"
        });
        let err = build_license_from_response(&response, "BAD").unwrap_err();
        assert!(err.contains("license_key_not_found") || err.contains("verify"));
    }

    #[test]
    fn friendly_error_explains_unknown_license_key() {
        let msg = friendly_activation_error(404, "license_key_not_found");
        assert!(msg.contains("wasn't recognized"));
        assert!(msg.contains("hello@dictivo.app"));
    }

    #[test]
    fn friendly_error_explains_seat_exhaustion() {
        let msg = friendly_activation_error(422, "activation_limit");
        assert!(msg.to_lowercase().contains("maximum number of devices"));
        assert!(msg.contains("other devices"));
        assert!(!msg.contains("Mac"));
        assert!(msg.contains("Remove from this device"));
    }

    #[test]
    fn friendly_error_explains_revoked_license() {
        let msg = friendly_activation_error(403, "license_key_disabled");
        assert!(msg.to_lowercase().contains("disabled"));
    }

    #[test]
    fn friendly_error_falls_back_for_unknown_payload() {
        let msg = friendly_activation_error(500, "");
        assert!(msg.contains("Activation failed"));
    }

    fn test_license() -> License {
        License {
            license_key: "KEY-1234".to_string(),
            instance_id: "inst-1".to_string(),
            instance_name: "Test".to_string(),
            customer_email: "alice@example.com".to_string(),
            customer_name: "Alice".to_string(),
            order_id: "123".to_string(),
            product_name: "Dictivo".to_string(),
            variant_name: "Personal".to_string(),
            created_at: "2026-05-14T10:00:00Z".to_string(),
            updates_until: "2027-05-14T10:00:00Z".to_string(),
            status: "active".to_string(),
            last_refreshed_at: "2026-05-14T10:00:00Z".to_string(),
        }
    }
}
