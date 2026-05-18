import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ selectedTier: "medium", onboardingCompleted: true, companionEnabled: false })
    );
  });
});

test("tier cards render with Quality label and show Active on selected", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/i }).click();
  // The Settings sidebar already shows the Engine section by default.
  await expect(page.getByRole("button", { name: /Quality tier/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fast tier/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Medium tier/i })).toBeVisible();
  // Quality card carries the new honest sub-line.
  await expect(page.getByText("Most accurate · may take longer")).toBeVisible();
  // Medium is the active tier per the seeded settings.
  await expect(page.getByRole("button", { name: /Medium tier/i })).toHaveAttribute("aria-pressed", "true");
});

test("clicking out-of-budget tier opens warning confirm", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/i }).click();
  await page.getByRole("button", { name: /Quality tier/i }).click();
  await expect(page.getByRole("dialog", { name: /may run slowly/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cancel/i })).toBeVisible();
});

test("cancel button dismisses the inline confirm without changing tier", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/i }).click();
  await page.getByRole("button", { name: /Quality tier/i }).click();
  await page.getByRole("button", { name: /Cancel/i }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  // Medium is still active.
  await expect(page.getByRole("button", { name: /Medium tier/i })).toHaveAttribute("aria-pressed", "true");
});
