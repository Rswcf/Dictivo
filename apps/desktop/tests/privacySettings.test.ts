import { describe, expect, it } from "vitest";
import { canOpenPermissionSettings, describePermissionStatus, privacyPermissionItems } from "../src/components/SettingsView";

describe("privacy settings display", () => {
  it("maps internal native permission placeholders to user-facing copy", () => {
    const status = describePermissionStatus("pending-native-prompt");

    expect(status.label).toBe("Needs system check");
    expect(`${status.label} ${status.detail}`).not.toContain("pending-native-prompt");
  });

  it("maps platform-native permission states to actionable copy", () => {
    expect(describePermissionStatus("not-required")).toEqual({
      label: "Not required",
      detail: "This platform does not require an extra permission for this workflow.",
      tone: "ready"
    });
    expect(describePermissionStatus("denied").detail).toContain("Enable this permission in system settings");
    expect(describePermissionStatus("not-verified").label).toBe("Not verified");
  });

  it("keeps the privacy page focused on the three product permissions", () => {
    expect(privacyPermissionItems.map((item) => item.key)).toEqual(["microphone", "accessibility", "pasteAutomation"]);
    expect(privacyPermissionItems.map((item) => item.requirement)).toEqual(["Required", "Recommended", "Optional"]);
  });

  it("only offers system settings for statuses the OS can plausibly fix", () => {
    expect(canOpenPermissionSettings("denied")).toBe(true);
    expect(canOpenPermissionSettings("not-determined")).toBe(true);
    expect(canOpenPermissionSettings("not-verified")).toBe(true);
    expect(canOpenPermissionSettings("web-preview")).toBe(false);
    expect(canOpenPermissionSettings("clipboard-only")).toBe(false);
    expect(canOpenPermissionSettings("not-required")).toBe(false);
    expect(canOpenPermissionSettings("granted")).toBe(false);
  });
});
