import { describe, expect, it } from "vitest";
import { describePermissionStatus, privacyPermissionItems } from "../src/components/SettingsView";

describe("privacy settings display", () => {
  it("maps internal native permission placeholders to user-facing copy", () => {
    const status = describePermissionStatus("pending-native-prompt");

    expect(status.label).toBe("Needs system check");
    expect(`${status.label} ${status.detail}`).not.toContain("pending-native-prompt");
  });

  it("keeps the privacy page focused on the three product permissions", () => {
    expect(privacyPermissionItems.map((item) => item.key)).toEqual(["microphone", "accessibility", "pasteAutomation"]);
    expect(privacyPermissionItems.map((item) => item.requirement)).toEqual(["Required", "Recommended", "Optional"]);
  });
});
