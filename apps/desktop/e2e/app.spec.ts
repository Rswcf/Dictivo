import { expect, test } from "@playwright/test";

const seededSessions = [
  {
    id: "session_seeded",
    title: "Seeded Local Dictation",
    mode: "message",
    language: "en",
    privacyMode: "local-only",
    provider: "local-whisper",
    createdAt: "2026-05-11T12:00:00.000Z",
    durationSeconds: 8,
    wordCount: 4,
    rawText: "seeded raw transcript",
    text: "Seeded final transcript."
  }
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((sessions) => {
    localStorage.clear();
    localStorage.setItem("dictivo-local-sessions", JSON.stringify(sessions));
    localStorage.setItem(
      "dictivo-settings-v4",
      JSON.stringify({ selectedTier: "medium", onboardingCompleted: true, companionEnabled: false })
    );
  }, seededSessions);
});

test("navigates core screens and handles the blocked dictation path", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dictation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start dictation" })).toBeVisible();
  await expect(page.getByLabel("Live dictation text")).toHaveValue("");

  await page.getByRole("button", { name: "Email" }).click();
  await expect(page.getByRole("button", { name: "Email" })).toHaveClass(/is-selected/);

  await page.getByLabel("Live dictation text").fill("Long draft with symbols !@#$%^&*() and CJK 本地优先");
  await page.getByRole("button", { name: "Start dictation" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator(".status-banner")).toContainText("Private Fast requires the desktop app runtime.");
  await expect(page.getByRole("heading", { name: "Local Engine" })).toBeVisible();

  await page.getByRole("button", { name: "Dictation" }).click();
  await expect(page.getByLabel("Live dictation text")).toHaveValue("Long draft with symbols !@#$%^&*() and CJK 本地优先");

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Local History" })).toBeVisible();
  await expect(page.getByText("Seeded Local Dictation")).toBeVisible();

  await page.getByPlaceholder("Search local history").fill("no-match-!@#");
  await expect(page.getByText("No local dictations match this search.")).toBeVisible();
  await page.getByPlaceholder("Search local history").fill("Seeded");
  await expect(page.getByText("Seeded final transcript.")).toBeVisible();
});

test("exercises forms, repeated clicks, keyboard recording, and responsive wireframe styling", async ({ page, viewport }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Dictionary" }).click();
  await expect(page.getByRole("heading", { name: "Dictionary & Snippets" })).toBeVisible();
  await page.getByPlaceholder("Supabase, 张伟, kubectl...").fill("VeryLongDictivoTerm-特殊字符-1234567890");
  await page.getByRole("button", { name: "Add term" }).click();
  await expect(page.getByRole("button", { name: "VeryLongDictivoTerm-特殊字符-1234567890" })).toBeVisible();
  await page.getByRole("button", { name: "VeryLongDictivoTerm-特殊字符-1234567890" }).click();
  await expect(page.getByRole("button", { name: "VeryLongDictivoTerm-特殊字符-1234567890" })).toBeHidden();

  await page.getByPlaceholder("my calendar link").fill("demo trigger");
  await page.getByPlaceholder("https://...").fill("https://example.test/path?query=!@#&long=abcdefghijklmnopqrstuvwxyz");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("demo trigger")).toBeVisible();
  await page.locator(".snippet-list").getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText("demo trigger")).toBeHidden();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Hotkeys" }).click();
  await page.getByRole("button", { name: "Change" }).first().click();
  await page.keyboard.press("Control+Alt+K");
  await expect(page.getByText("CommandOrControl+Alt+K")).toBeVisible();

  for (const section of ["Companion", "Privacy", "Local Engine", "Hotkeys"]) {
    await page.getByRole("button", { name: section }).click();
  }
  await expect(page.getByText("Paste Last")).toBeVisible();

  const surface = await page.locator(".side-panel").first().evaluate((node) => {
    const styles = getComputedStyle(node);
    return { background: styles.backgroundColor, color: styles.color };
  });
  expect(surface.background).toBeTruthy();
  expect(surface.color).toBeTruthy();

  const navBox = await page.locator(".sidebar").boundingBox();
  const workspaceBox = await page.locator(".workspace").boundingBox();
  expect(navBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();

  if (viewport && viewport.width <= 720) {
    expect(navBox!.height).toBeLessThan(workspaceBox!.height);
  } else {
    expect(navBox!.width).toBeLessThan(workspaceBox!.width);
  }

  const screenshot = await page.locator(".app-shell").screenshot({ animations: "disabled" });
  expect(screenshot.byteLength).toBeGreaterThan(20_000);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
