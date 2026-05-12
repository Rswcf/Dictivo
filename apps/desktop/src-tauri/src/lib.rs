mod private_fast;
mod storage;

use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, WindowEvent};

const TRAY_ID: &str = "dictivo-tray";
const MENU_STATUS: &str = "status";
const MENU_SHOW_MAIN: &str = "show-main";
const MENU_HIDE_COMPANION: &str = "hide-companion";
const MENU_QUIT: &str = "quit";

struct AppLifecycle {
    is_quitting: AtomicBool,
}

impl Default for AppLifecycle {
    fn default() -> Self {
        Self {
            is_quitting: AtomicBool::new(false),
        }
    }
}

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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardMarker {
    kind: String,
    signature: String,
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
fn clipboard_marker() -> Result<ClipboardMarker, String> {
    current_clipboard_marker()
}

#[tauri::command]
fn paste_text(
    text: String,
    expected_clipboard_marker: Option<ClipboardMarker>,
) -> Result<PasteResult, String> {
    let clipboard_changed = clipboard_changed_since(expected_clipboard_marker)?;

    let mut clipboard = arboard::Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_text(text)
        .map_err(|error| error.to_string())?;
    drop(clipboard);

    if clipboard_changed {
        return Ok(PasteResult {
            pasted: false,
            copied: true,
            method: "clipboard-changed-copied".to_string(),
        });
    }

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

fn clipboard_changed_since(expected_clipboard_marker: Option<ClipboardMarker>) -> Result<bool, String> {
    let Some(expected) = expected_clipboard_marker else {
        return Ok(false);
    };
    let current = current_clipboard_marker()?;
    Ok(current != expected)
}

#[tauri::command]
fn start_dictation() -> Result<String, String> {
    Ok(format!(
        "session-{}",
        time::OffsetDateTime::now_utc().unix_timestamp()
    ))
}

#[tauri::command]
fn stop_dictation() -> Result<String, String> {
    Ok("Dictation stopped".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppLifecycle::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            storage::init_database().map_err(Box::<dyn std::error::Error>::from)?;
            configure_tray(app).map_err(Box::<dyn std::error::Error>::from)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let lifecycle = window.app_handle().state::<AppLifecycle>();
                if should_hide_on_close(
                    window.label(),
                    lifecycle.is_quitting.load(Ordering::SeqCst),
                ) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            request_permissions,
            clipboard_marker,
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
            private_fast::detect_gpu,
            private_fast::benchmark_tier,
            private_fast::runnable_tiers,
            private_fast::write_runnable_tiers,
            private_fast::rerun_benchmark,
            storage::save_session,
            storage::list_sessions,
            storage::clear_sessions
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dictivo");
}

fn configure_tray(app: &tauri::App) -> tauri::Result<()> {
    let status = MenuItem::with_id(
        app,
        MENU_STATUS,
        "Dictivo is running",
        false,
        None::<&str>,
    )?;
    let show_main = MenuItem::with_id(app, MENU_SHOW_MAIN, "Show Dictivo", true, None::<&str>)?;
    let hide_companion = MenuItem::with_id(
        app,
        MENU_HIDE_COMPANION,
        "Hide Companion",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "Quit Dictivo", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&status, &show_main, &hide_companion, &quit])?;

    let Some(icon) = app.default_window_icon().cloned() else {
        return Ok(());
    };

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Dictivo is running locally")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_SHOW_MAIN => show_window(app, "main"),
            MENU_HIDE_COMPANION => {
                let _ = app.emit_to("main", "companion-hide-requested", {});
                hide_window(app, "companion");
            }
            MENU_QUIT => {
                app.state::<AppLifecycle>()
                    .is_quitting
                    .store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle(), "main");
            }
        })
        .build(app)?;

    Ok(())
}

fn show_window<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_window<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.hide();
    }
}

fn should_hide_on_close(window_label: &str, is_quitting: bool) -> bool {
    !is_quitting && matches!(window_label, "main" | "companion")
}

fn current_clipboard_marker() -> Result<ClipboardMarker, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|error| error.to_string())?;

    if let Ok(text) = clipboard.get_text() {
        return Ok(marker_from_bytes("text", text.as_bytes()));
    }

    if let Ok(image) = clipboard.get_image() {
        let mut hasher = DefaultHasher::new();
        image.width.hash(&mut hasher);
        image.height.hash(&mut hasher);
        image.bytes.hash(&mut hasher);
        return Ok(ClipboardMarker {
            kind: "image".to_string(),
            signature: format!("{:016x}", hasher.finish()),
        });
    }

    Ok(ClipboardMarker {
        kind: "empty".to_string(),
        signature: "0".to_string(),
    })
}

fn marker_from_bytes(kind: &str, bytes: &[u8]) -> ClipboardMarker {
    let mut hasher = DefaultHasher::new();
    kind.hash(&mut hasher);
    bytes.hash(&mut hasher);
    ClipboardMarker {
        kind: kind.to_string(),
        signature: format!("{:016x}", hasher.finish()),
    }
}

#[cfg(test)]
mod tests {
    use super::{clipboard_changed_since, marker_from_bytes, should_hide_on_close};

    #[test]
    fn close_hides_main_and_companion_while_app_keeps_running() {
        assert!(should_hide_on_close("main", false));
        assert!(should_hide_on_close("companion", false));
    }

    #[test]
    fn close_is_not_intercepted_when_quitting_or_for_unknown_windows() {
        assert!(!should_hide_on_close("main", true));
        assert!(!should_hide_on_close("companion", true));
        assert!(!should_hide_on_close("settings", false));
    }

    #[test]
    fn clipboard_marker_is_stable_for_the_same_payload() {
        assert_eq!(
            marker_from_bytes("text", b"dictivo"),
            marker_from_bytes("text", b"dictivo")
        );
    }

    #[test]
    fn clipboard_marker_changes_when_payload_or_kind_changes() {
        assert_ne!(
            marker_from_bytes("text", b"dictivo"),
            marker_from_bytes("text", b"other text")
        );
        assert_ne!(
            marker_from_bytes("text", b"dictivo"),
            marker_from_bytes("image", b"dictivo")
        );
    }

    #[test]
    fn missing_clipboard_marker_allows_copy_and_auto_paste_attempt() {
        assert!(!clipboard_changed_since(None).unwrap());
    }
}
