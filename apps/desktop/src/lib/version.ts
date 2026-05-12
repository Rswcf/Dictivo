import { getVersion } from "@tauri-apps/api/app";
import { isTauriRuntime } from "./desktopBridge";

declare const __DICTIVO_VERSION__: string | undefined;

export const BUNDLED_APP_VERSION =
  typeof __DICTIVO_VERSION__ === "string" && __DICTIVO_VERSION__.trim().length > 0
    ? __DICTIVO_VERSION__
    : "0.0.0-dev";

export async function getAppVersion() {
  if (!isTauriRuntime()) return BUNDLED_APP_VERSION;

  try {
    return await getVersion();
  } catch {
    return BUNDLED_APP_VERSION;
  }
}
