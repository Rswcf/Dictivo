use global_hotkey::{hotkey::HotKey, GlobalHotKeyManager};
use std::str::FromStr;

const DEFAULT_SHORTCUTS: [&str; 2] = ["CommandOrControl+Shift+Space", "CommandOrControl+Shift+V"];

#[test]
#[ignore = "requires an interactive desktop session with the shortcuts unclaimed"]
fn reserves_default_global_hotkeys() {
    let manager = GlobalHotKeyManager::new().expect("create global hotkey manager");

    for shortcut in DEFAULT_SHORTCUTS {
        let hotkey =
            HotKey::from_str(shortcut).unwrap_or_else(|error| panic!("parse {shortcut}: {error}"));
        manager
            .register(hotkey)
            .unwrap_or_else(|error| panic!("reserve {shortcut}: {error}"));
        manager
            .unregister(hotkey)
            .unwrap_or_else(|error| panic!("release {shortcut}: {error}"));
    }
}
