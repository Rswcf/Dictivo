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

    // From <AppKit/NSWindow.h> NSWindowCollectionBehavior bit flags:
    //   NSWindowCollectionBehaviorCanJoinAllSpaces    = 1 << 0  = 1
    //   NSWindowCollectionBehaviorStationary          = 1 << 4  = 16
    //   NSWindowCollectionBehaviorFullScreenAuxiliary = 1 << 8  = 256
    //
    // The CanJoinAllSpaces bit is already set by Tauri because we have
    // `visibleOnAllWorkspaces: true` in tauri.conf.json. We OR in the missing
    // FullScreenAuxiliary bit, leaving any other bits Tauri set untouched.
    const CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
    const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;
    const NEEDED_FLAGS: u64 = CAN_JOIN_ALL_SPACES | FULL_SCREEN_AUXILIARY;

    let (before, after) = unsafe {
        let before: u64 = msg_send![ns_window, collectionBehavior];
        // Ensure BOTH bits are set — defensive in case Tauri's
        // visibleOnAllWorkspaces hasn't been applied yet (timing dependent
        // on macOS / Tauri version).
        let after = before | NEEDED_FLAGS;
        let _: () = msg_send![ns_window, setCollectionBehavior: after];
        // Read back the value so we know the OS accepted the write.
        let observed: u64 = msg_send![ns_window, collectionBehavior];
        (before, observed)
    };

    let report = format!(
        "companion NSWindow collectionBehavior: before=0x{before:x} after=0x{after:x} (CanJoinAllSpaces={} FullScreenAuxiliary={})",
        (after & CAN_JOIN_ALL_SPACES) != 0,
        (after & FULL_SCREEN_AUXILIARY) != 0
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
