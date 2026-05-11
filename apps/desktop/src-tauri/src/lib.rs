mod storage;
mod private_fast;

use serde::Serialize;
use std::process::Command;
use std::thread;
use std::time::Duration;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PermissionStatus {
    microphone: String,
    accessibility: String,
    paste_automation: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PasteResult {
    pasted: bool,
    copied: bool,
    method: String,
}

#[tauri::command]
fn request_permissions() -> PermissionStatus {
    PermissionStatus {
        microphone: "pending-native-prompt".to_string(),
        accessibility: "pending-native-prompt".to_string(),
        paste_automation: "pending-native-prompt".to_string(),
    }
}

#[tauri::command]
fn paste_text(text: String) -> Result<PasteResult, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|error| error.to_string())?;
    clipboard.set_text(text).map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("osascript")
            .arg("-e")
            .arg(r#"tell application "System Events" to keystroke "v" using command down"#)
            .status()
            .map_err(|error| error.to_string())?;

        if status.success() {
            thread::sleep(Duration::from_millis(650));
            return Ok(PasteResult {
                pasted: true,
                copied: true,
                method: "macos-apple-events".to_string(),
            });
        }
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg("$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^v')")
            .status()
            .map_err(|error| error.to_string())?;

        if status.success() {
            thread::sleep(Duration::from_millis(350));
            return Ok(PasteResult {
                pasted: true,
                copied: true,
                method: "windows-sendkeys".to_string(),
            });
        }
    }

    Ok(PasteResult {
        pasted: false,
        copied: true,
        method: "clipboard".to_string(),
    })
}

#[tauri::command]
fn start_dictation() -> Result<String, String> {
    Ok(format!("session-{}", time::OffsetDateTime::now_utc().unix_timestamp()))
}

#[tauri::command]
fn stop_dictation() -> Result<String, String> {
    Ok("Dictation stopped".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            storage::init_database().map_err(Box::<dyn std::error::Error>::from)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            request_permissions,
            paste_text,
            start_dictation,
            stop_dictation,
            private_fast::hardware_profile,
            private_fast::private_fast_status,
            private_fast::private_fast_models,
            private_fast::select_private_fast_model,
            private_fast::download_private_fast_model,
            private_fast::import_private_fast_model,
            private_fast::delete_private_fast_model,
            private_fast::transcribe_private_fast,
            storage::save_session,
            storage::list_sessions,
            storage::clear_sessions
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dictivo");
}
