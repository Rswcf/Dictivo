import { test, expect } from "@playwright/test";

test("first launch shows onboarding wizard then main shell", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto("/");
  await expect(page.getByText(/Looking at your computer/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue/i })).toBeVisible();
  await page.getByRole("button", { name: /Continue/i }).click();
  await expect(page.getByRole("heading", { name: /Recommended for your hardware/i })).toBeVisible();
  // Web preview cannot actually download; use Skip path
  await page.getByRole("button", { name: /Skip setup/i }).click();
  await expect(page.getByRole("heading", { name: /Dictation/i }).first()).toBeVisible();
});
