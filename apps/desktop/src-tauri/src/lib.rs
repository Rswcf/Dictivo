mod companion_macos;
mod license;
mod private_fast;
mod storage;
mod updater;

use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
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

fn quiet_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

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

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
enum PermissionSettingsTarget {
    Microphone,
    Accessibility,
    PasteAutomation,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PermissionSettingsPlatform {
    #[cfg(any(test, target_os = "macos"))]
    Macos,
    #[cfg(any(test, target_os = "windows"))]
    Windows,
    #[cfg(any(test, all(not(target_os = "macos"), not(target_os = "windows"))))]
    Linux,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PasteResult {
    pasted: bool,
    copied: bool,
    method: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CopyResult {
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
        microphone: microphone_permission_status().to_string(),
        accessibility: accessibility_permission_status().to_string(),
        paste_automation: paste_automation_permission_status().to_string(),
    }
}

fn microphone_permission_status() -> &'static str {
    "not-determined"
}

#[cfg(target_os = "macos")]
fn accessibility_permission_status() -> &'static str {
    accessibility_status_from_trusted(macos_accessibility_trusted())
}

#[cfg(not(target_os = "macos"))]
fn accessibility_permission_status() -> &'static str {
    "not-required"
}

fn accessibility_status_from_trusted(trusted: bool) -> &'static str {
    if trusted {
        "granted"
    } else {
        "denied"
    }
}

#[cfg(target_os = "macos")]
fn paste_automation_permission_status() -> &'static str {
    "not-verified"
}

#[cfg(target_os = "windows")]
fn paste_automation_permission_status() -> &'static str {
    "not-verified"
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn paste_automation_permission_status() -> &'static str {
    "clipboard-only"
}

#[cfg(target_os = "macos")]
fn macos_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

#[tauri::command]
fn open_permission_settings(target: PermissionSettingsTarget) -> Result<(), String> {
    let (program, args) = permission_settings_command(target);
    let status = quiet_command(program)
        .args(args)
        .status()
        .map_err(|error| format!("Unable to open system settings: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("Unable to open system settings automatically. Open Privacy & Security in system settings and grant the permission manually.".to_string())
    }
}

fn permission_settings_command(
    target: PermissionSettingsTarget,
) -> (&'static str, Vec<&'static str>) {
    permission_settings_command_for_platform(current_permission_settings_platform(), target)
}

fn current_permission_settings_platform() -> PermissionSettingsPlatform {
    #[cfg(target_os = "macos")]
    {
        return PermissionSettingsPlatform::Macos;
    }
    #[cfg(target_os = "windows")]
    {
        return PermissionSettingsPlatform::Windows;
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        PermissionSettingsPlatform::Linux
    }
}

fn permission_settings_command_for_platform(
    platform: PermissionSettingsPlatform,
    target: PermissionSettingsTarget,
) -> (&'static str, Vec<&'static str>) {
    match platform {
        #[cfg(any(test, target_os = "macos"))]
        PermissionSettingsPlatform::Macos => {
            let url = match target {
                PermissionSettingsTarget::Microphone => {
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
                }
                PermissionSettingsTarget::Accessibility => {
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
                }
                PermissionSettingsTarget::PasteAutomation => {
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
                }
            };
            ("open", vec![url])
        }
        #[cfg(any(test, target_os = "windows"))]
        PermissionSettingsPlatform::Windows => {
            let uri = match target {
                PermissionSettingsTarget::Microphone => "ms-settings:privacy-microphone",
                PermissionSettingsTarget::Accessibility => "ms-settings:easeofaccess-keyboard",
                PermissionSettingsTarget::PasteAutomation => "ms-settings:privacy",
            };
            ("cmd", vec!["/C", "start", "", uri])
        }
        #[cfg(any(test, all(not(target_os = "macos"), not(target_os = "windows"))))]
        PermissionSettingsPlatform::Linux => {
            let uri = match target {
                PermissionSettingsTarget::Microphone => "settings://privacy",
                PermissionSettingsTarget::Accessibility => "settings://universal-access",
                PermissionSettingsTarget::PasteAutomation => "settings://privacy",
            };
            ("xdg-open", vec![uri])
        }
    }
}

#[tauri::command]
fn clipboard_marker() -> Result<ClipboardMarker, String> {
    current_clipboard_marker()
}

#[tauri::command]
fn copy_text(text: String) -> Result<CopyResult, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_text(text)
        .map_err(|error| error.to_string())?;

    Ok(CopyResult {
        copied: true,
        method: "clipboard".to_string(),
    })
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
        let status = quiet_command("osascript")
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
        let status = quiet_command("powershell")
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

fn clipboard_changed_since(
    expected_clipboard_marker: Option<ClipboardMarker>,
) -> Result<bool, String> {
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            storage::init_database().map_err(Box::<dyn std::error::Error>::from)?;
            configure_tray(app).map_err(Box::<dyn std::error::Error>::from)?;
            // Make the companion window survive fullscreen apps (see
            // companion_macos.rs for the why). We log + swallow the error
            // because the persistence is a polish feature — a setup failure
            // shouldn't take down the whole app launch.
            if let Err(error) = companion_macos::apply_companion_collection_behavior(app.handle()) {
                eprintln!("companion collection behavior setup failed: {error}");
            }
            schedule_initial_update_check(app.handle().clone());
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
            open_permission_settings,
            clipboard_marker,
            copy_text,
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
            private_fast::finalize_calibration,
            storage::save_session,
            storage::list_sessions,
            storage::clear_sessions,
            storage::delete_session,
            license::license_activate,
            license::license_get,
            license::license_refresh,
            license::license_deactivate,
            updater::updater_check_now,
            updater::updater_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dictivo");
}

fn configure_tray(app: &tauri::App) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, MENU_STATUS, "Dictivo is running", false, None::<&str>)?;
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
        .on_menu_event(|app, event| match tray_menu_action(event.id().as_ref()) {
            TrayMenuAction::ShowMain => show_window(app, "main"),
            TrayMenuAction::HideCompanion => {
                let _ = app.emit_to("main", "companion-hide-requested", {});
                hide_window(app, "companion");
            }
            TrayMenuAction::Quit => {
                app.state::<AppLifecycle>()
                    .is_quitting
                    .store(true, Ordering::SeqCst);
                app.exit(0);
            }
            TrayMenuAction::None => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                if tray_click_shows_main(button, button_state) {
                    show_window(tray.app_handle(), "main");
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TrayMenuAction {
    ShowMain,
    HideCompanion,
    Quit,
    None,
}

fn tray_menu_action(menu_id: &str) -> TrayMenuAction {
    match menu_id {
        MENU_SHOW_MAIN => TrayMenuAction::ShowMain,
        MENU_HIDE_COMPANION => TrayMenuAction::HideCompanion,
        MENU_QUIT => TrayMenuAction::Quit,
        _ => TrayMenuAction::None,
    }
}

fn tray_click_shows_main(button: MouseButton, button_state: MouseButtonState) -> bool {
    matches!(
        (button, button_state),
        (MouseButton::Left, MouseButtonState::Up)
    )
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

/// Fires an initial update check ~5 seconds after launch, then re-checks every
/// 24 hours while the app is running. All results are emitted as events the
/// React side listens to; failures are silent.
fn schedule_initial_update_check(handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Let the app finish its cold-start work first.
        tokio::time::sleep(Duration::from_secs(5)).await;
        let _ = updater::check_and_notify(&handle).await;

        let mut ticker = tokio::time::interval(Duration::from_secs(24 * 60 * 60));
        // The first tick fires immediately; skip it since we just checked.
        ticker.tick().await;
        loop {
            ticker.tick().await;
            let _ = updater::check_and_notify(&handle).await;
        }
    });
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
    use super::{
        accessibility_status_from_trusted, clipboard_changed_since, marker_from_bytes,
        permission_settings_command, permission_settings_command_for_platform,
        should_hide_on_close, tray_click_shows_main, tray_menu_action, PermissionSettingsPlatform,
        PermissionSettingsTarget, TrayMenuAction, MENU_HIDE_COMPANION, MENU_QUIT, MENU_SHOW_MAIN,
        MENU_STATUS,
    };
    use tauri::tray::{MouseButton, MouseButtonState};

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
    fn tray_menu_ids_map_to_expected_window_actions() {
        assert_eq!(tray_menu_action(MENU_SHOW_MAIN), TrayMenuAction::ShowMain);
        assert_eq!(
            tray_menu_action(MENU_HIDE_COMPANION),
            TrayMenuAction::HideCompanion
        );
        assert_eq!(tray_menu_action(MENU_QUIT), TrayMenuAction::Quit);
        assert_eq!(tray_menu_action(MENU_STATUS), TrayMenuAction::None);
        assert_eq!(tray_menu_action("unknown"), TrayMenuAction::None);
    }

    #[test]
    fn tray_left_click_release_shows_main_window() {
        assert!(tray_click_shows_main(
            MouseButton::Left,
            MouseButtonState::Up
        ));
        assert!(!tray_click_shows_main(
            MouseButton::Left,
            MouseButtonState::Down
        ));
        assert!(!tray_click_shows_main(
            MouseButton::Right,
            MouseButtonState::Up
        ));
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

    #[test]
    fn accessibility_trust_maps_to_user_permission_status() {
        assert_eq!(accessibility_status_from_trusted(true), "granted");
        assert_eq!(accessibility_status_from_trusted(false), "denied");
    }

    #[test]
    fn permission_settings_command_targets_platform_privacy_pages() {
        let (program, microphone_args) =
            permission_settings_command(PermissionSettingsTarget::Microphone);
        let (_, accessibility_args) =
            permission_settings_command(PermissionSettingsTarget::Accessibility);
        let (_, automation_args) =
            permission_settings_command(PermissionSettingsTarget::PasteAutomation);

        #[cfg(target_os = "macos")]
        {
            assert_eq!(program, "open");
            assert!(microphone_args[0].contains("Privacy_Microphone"));
            assert!(accessibility_args[0].contains("Privacy_Accessibility"));
            assert!(automation_args[0].contains("Privacy_Automation"));
        }

        #[cfg(target_os = "windows")]
        {
            assert_eq!(program, "cmd");
            assert!(microphone_args.contains(&"ms-settings:privacy-microphone"));
            assert!(accessibility_args.contains(&"ms-settings:easeofaccess-keyboard"));
        }

        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        {
            assert_eq!(program, "xdg-open");
            assert!(microphone_args[0].contains("privacy"));
            assert!(accessibility_args[0].contains("universal-access"));
        }
    }

    #[test]
    fn permission_settings_commands_are_locked_for_all_release_platforms() {
        assert_eq!(
            permission_settings_command_for_platform(
                PermissionSettingsPlatform::Macos,
                PermissionSettingsTarget::Microphone
            ),
            (
                "open",
                vec!["x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"]
            )
        );
        assert_eq!(
            permission_settings_command_for_platform(
                PermissionSettingsPlatform::Macos,
                PermissionSettingsTarget::Accessibility
            ),
            (
                "open",
                vec![
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
                ]
            )
        );
        assert_eq!(
            permission_settings_command_for_platform(
                PermissionSettingsPlatform::Macos,
                PermissionSettingsTarget::PasteAutomation
            ),
            (
                "open",
                vec!["x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"]
            )
        );

        assert_eq!(
            permission_settings_command_for_platform(
                PermissionSettingsPlatform::Windows,
                PermissionSettingsTarget::Microphone
            ),
            (
                "cmd",
                vec!["/C", "start", "", "ms-settings:privacy-microphone"]
            )
        );
        assert_eq!(
            permission_settings_command_for_platform(
                PermissionSettingsPlatform::Windows,
                PermissionSettingsTarget::Accessibility
            ),
            (
                "cmd",
                vec!["/C", "start", "", "ms-settings:easeofaccess-keyboard"]
            )
        );
        assert_eq!(
            permission_settings_command_for_platform(
                PermissionSettingsPlatform::Windows,
                PermissionSettingsTarget::PasteAutomation
            ),
            ("cmd", vec!["/C", "start", "", "ms-settings:privacy"])
        );

        assert_eq!(
            permission_settings_command_for_platform(
                PermissionSettingsPlatform::Linux,
                PermissionSettingsTarget::Microphone
            ),
            ("xdg-open", vec!["settings://privacy"])
        );
        assert_eq!(
            permission_settings_command_for_platform(
                PermissionSettingsPlatform::Linux,
                PermissionSettingsTarget::Accessibility
            ),
            ("xdg-open", vec!["settings://universal-access"])
        );
        assert_eq!(
            permission_settings_command_for_platform(
                PermissionSettingsPlatform::Linux,
                PermissionSettingsTarget::PasteAutomation
            ),
            ("xdg-open", vec!["settings://privacy"])
        );
    }
}
