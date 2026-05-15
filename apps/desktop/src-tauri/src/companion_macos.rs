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
pub fn apply_companion_collection_behavior(handle: &tauri::AppHandle) -> Result<(), String> {
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
    const FULL_SCREEN_AUXILIARY: u64 = 1 << 8;

    unsafe {
        let current: u64 = msg_send![ns_window, collectionBehavior];
        let updated = current | FULL_SCREEN_AUXILIARY;
        let _: () = msg_send![ns_window, setCollectionBehavior: updated];
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn apply_companion_collection_behavior(_handle: &tauri::AppHandle) -> Result<(), String> {
    // No-op on Windows/Linux — those platforms don't have the macOS Spaces /
    // fullscreen-aux concept, and Tauri's plain alwaysOnTop handles them.
    Ok(())
}
