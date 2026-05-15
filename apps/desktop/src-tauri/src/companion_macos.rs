//! macOS-only quirks for the floating companion window.
//!
//! The Tauri config flag `visibleOnAllWorkspaces: true` only sets one bit on
//! the underlying NSWindowCollectionBehavior — `CanJoinAllSpaces`. That's
//! enough to keep the companion visible when the user switches between
//! regular Spaces, but it does **not** make the window appear over apps
//! running in macOS fullscreen mode (a separate Mission Control concept).
//!
//! For that, we need `NSWindowCollectionBehaviorFullScreenAuxiliary` — and
//! Tauri 2 has no API surface that sets it. So we drop down to AppKit and
//! OR the bit in ourselves once the companion's NSWindow is constructed.
//!
//! The bug this fixes: with v0.2.4 the companion correctly followed the user
//! across regular Spaces but vanished the moment they switched to a
//! fullscreen Safari / VS Code / etc. Competitive tools like Voicy already
//! do this; without it our "always available" widget promise is broken.

#[cfg(target_os = "macos")]
pub fn apply_companion_collection_behavior(handle: &tauri::AppHandle) -> Result<String, String> {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use tauri::Manager;

    let window = handle
        .get_webview_window("companion")
        .ok_or_else(|| "companion window not yet created".to_string())?;

    let ns_window_ptr = window
        .ns_window()
        .map_err(|e| format!("ns_window() failed: {e}"))?;
    if ns_window_ptr.is_null() {
        return Err("companion ns_window pointer is null".to_string());
    }
    let ns_window = ns_window_ptr as *mut AnyObject;

    // ────────────────────────────────────────────────────────────────────
    // Layer 1: collection behavior — tell macOS the window is allowed to
    // coexist with fullscreen apps and join every Space.
    //
    // NSWindowCollectionBehavior bit flags (from <AppKit/NSWindow.h>):
    //   NSWindowCollectionBehaviorCanJoinAllSpaces    = 1 << 0  = 1
    //   NSWindowCollectionBehaviorStationary          = 1 << 4  = 16
    //   NSWindowCollectionBehaviorFullScreenAuxiliary = 1 << 8  = 256
    // ────────────────────────────────────────────────────────────────────
    const CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
    const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;
    const NEEDED_FLAGS: u64 = CAN_JOIN_ALL_SPACES | FULL_SCREEN_AUXILIARY;

    // ────────────────────────────────────────────────────────────────────
    // Layer 2: window level — Tauri's `alwaysOnTop: true` sets level 3
    // (NSFloatingWindowLevel), but fullscreen apps render at a level
    // *above* that, so a level-3 window gets covered.
    //
    // NSStatusWindowLevel (25) is the level the macOS menu bar lives at;
    // floating widgets like Raycast / Maccy / 1Password mini use it for
    // exactly this "stay above everything including fullscreen apps"
    // requirement. Higher levels (popUpMenu=101, screenSaver=1000) exist
    // but would also stomp on system overlays.
    // ────────────────────────────────────────────────────────────────────
    const NS_STATUS_WINDOW_LEVEL: i64 = 25;

    let (before_behavior, after_behavior, before_level, after_level) = unsafe {
        let before_behavior: u64 = msg_send![ns_window, collectionBehavior];
        let after_behavior = before_behavior | NEEDED_FLAGS;
        let _: () = msg_send![ns_window, setCollectionBehavior: after_behavior];

        let before_level: i64 = msg_send![ns_window, level];
        let _: () = msg_send![ns_window, setLevel: NS_STATUS_WINDOW_LEVEL];
        let after_level: i64 = msg_send![ns_window, level];

        // Read collectionBehavior back AFTER the level change in case
        // anything weird happens between the writes.
        let observed_behavior: u64 = msg_send![ns_window, collectionBehavior];
        (
            before_behavior,
            observed_behavior,
            before_level,
            after_level,
        )
    };

    let report = format!(
        "companion NSWindow: behavior before=0x{before_behavior:x} after=0x{after_behavior:x} \
         (CanJoinAllSpaces={} FullScreenAuxiliary={}) | level before={before_level} after={after_level}",
        (after_behavior & CAN_JOIN_ALL_SPACES) != 0,
        (after_behavior & FULL_SCREEN_AUXILIARY) != 0
    );
    eprintln!("{report}");
    Ok(report)
}

#[cfg(not(target_os = "macos"))]
pub fn apply_companion_collection_behavior(_handle: &tauri::AppHandle) -> Result<String, String> {
    // No-op on Windows/Linux — those platforms don't have the macOS Spaces /
    // fullscreen-aux concept, and Tauri's plain alwaysOnTop handles them.
    Ok("non-macOS — no-op".to_string())
}

/// Tauri command — the React side calls this from the companion's mount
/// effect so the FullScreenAuxiliary bit gets re-applied if macOS rebuilt
/// the NSWindow object after our setup-time call (Spaces / Stage Manager
/// transitions sometimes do this on recent macOS).
#[tauri::command]
pub async fn companion_apply_fullscreen_aux(app: tauri::AppHandle) -> Result<String, String> {
    apply_companion_collection_behavior(&app)
}
