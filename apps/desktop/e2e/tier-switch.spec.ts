import { test, expect } from "@playwright/test";

test("tier selector reflects selection in footer", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ selectedTier: "medium", onboardingCompleted: true, companionEnabled: false })
    );
  });
  await page.goto("/");
  // Web-preview RunnableTiers fallback returns fast + medium (both flagged as
  // downloaded), so switching does not trigger the native download dialog.
  await page.getByRole("radio", { name: /Fast/i }).click();
  await expect(page.locator(".workbench-footer")).toContainText(/Fast/);
});
