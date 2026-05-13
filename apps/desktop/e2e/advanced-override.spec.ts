import { expect, test } from "./fixtures";

test("settings advanced disclosure exposes raw model catalog", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ selectedTier: "medium", onboardingCompleted: true, companionEnabled: false })
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/i }).click();
  await page.getByText(/Advanced — full model catalog/i).click();
  // Web preview includes the static model catalog (Tiny, Base, Small, ...)
  await expect(page.getByText(/Tiny/i).first()).toBeVisible();
});
