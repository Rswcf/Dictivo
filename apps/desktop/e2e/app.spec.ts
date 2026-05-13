import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "./fixtures";

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
  },
  {
    id: "session_second",
    title: "Second Local Dictation",
    mode: "message",
    language: "en",
    privacyMode: "local-only",
    provider: "local-whisper",
    createdAt: "2026-05-11T12:01:00.000Z",
    durationSeconds: 6,
    wordCount: 3,
    rawText: "second raw transcript",
    text: "Second final transcript."
  }
];

const customAvatarPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lH5f1QAAAABJRU5ErkJggg==",
  "base64"
);

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
  await expect(page.getByRole("button", { name: "Email" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "AI Prompt" })).toHaveCount(0);

  await page.getByLabel("Live dictation text").fill("Long draft with symbols !@#$%^&*() and CJK 本地优先");
  await page.getByRole("button", { name: "Start dictation" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator(".status-banner")).toContainText("Private Fast requires the desktop app runtime.");
  await expect(page.getByRole("heading", { name: "Local Engine" })).toBeVisible();

  await page.getByRole("button", { name: "Dictation" }).click();
  await expect(page.getByLabel("Live dictation text")).toHaveValue("Long draft with symbols !@#$%^&*() and CJK 本地优先");

  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Local History" })).toBeVisible();
  await expect(page.getByText("Seeded Local Dictation")).toBeVisible();
  await expect(page.getByText("Second Local Dictation")).toBeVisible();

  await page.getByPlaceholder("Search local history").fill("no-match-!@#");
  await expect(page.getByText("No local dictations match this search.")).toBeVisible();
  await page.getByPlaceholder("Search local history").fill("Seeded");
  await expect(page.getByText("Seeded final transcript.")).toBeVisible();

  const seededItem = page.locator(".session-item", { hasText: "Seeded Local Dictation" });
  const [markdownDownload] = await Promise.all([
    page.waitForEvent("download"),
    seededItem.getByRole("button", { name: "Export markdown" }).click()
  ]);
  expect(markdownDownload.suggestedFilename()).toBe("session_seeded.md");
  const markdownPath = await markdownDownload.path();
  expect(markdownPath).not.toBeNull();
  expect(readFileSync(markdownPath!, "utf8")).toContain("# Seeded Local Dictation\n");
  expect(readFileSync(markdownPath!, "utf8")).toContain("Seeded final transcript.");

  await seededItem.getByRole("button", { name: "Copy final text" }).click();
  await expect(page.locator(".status-banner")).toContainText("Final text copied to clipboard.");

  await seededItem.getByRole("button", { name: "Delete message" }).click();
  await expect(page.locator(".status-banner")).toContainText("Message deleted.");
  await expect(page.getByText("Seeded Local Dictation")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("dictivo-local-sessions")))
    .not.toContain("session_seeded");

  await page.getByPlaceholder("Search local history").fill("");
  await page.getByRole("button", { name: "Clear local history" }).click();
  await expect(page.getByText("Delete all local history?")).toBeVisible();
  await page.getByRole("button", { name: "Delete all" }).click();
  await expect(page.locator(".status-banner")).toContainText("Local history cleared.");
  await expect(page.getByText("Second Local Dictation")).toBeHidden();
  await expect(page.getByText("No local dictations yet.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("dictivo-local-sessions"))).toBeNull();
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
  const displayedShortcut = await page.evaluate(() => (/Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘⌥K" : "Ctrl+Alt+K"));
  await page.getByRole("button", { name: "Dictation" }).click();
  await expect(page.locator(".suggestion-chips .key").first()).toContainText(displayedShortcut);
  await expect(page.getByText("Start / stop dictation")).toBeVisible();
  await expect(page.locator(".capture-hint kbd")).toContainText(displayedShortcut);
  await expect(page.locator(".companion-preview")).toBeHidden();
  await page.getByRole("button", { name: "Show floating companion" }).click();
  await expect(page.locator(".companion-preview")).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Hotkeys" }).click();

  for (const section of ["Companion", "Privacy", "Local Engine", "Hotkeys"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
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

test("uploads, persists, previews, and removes a custom companion avatar", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Companion", exact: true }).click();
  await page.getByRole("checkbox", { name: "Show floating companion" }).check();
  await page.getByLabel("Upload custom companion avatar").setInputFiles({
    name: "custom-avatar.png",
    mimeType: "image/png",
    buffer: customAvatarPng
  });

  const customButton = page.getByRole("button", { name: "Custom", exact: true });
  await expect(customButton).toBeVisible();
  await expect(customButton).toHaveClass(/is-selected/);
  await expect.poll(() => companionSettings(page)).toEqual({
    avatar: "custom",
    customName: "custom-avatar.png",
    enabled: true,
    hasCustomDataUrl: true
  });

  await page.getByRole("button", { name: "Dictation", exact: true }).click();
  await expect(page.locator(".companion-preview img[alt='Custom companion avatar']")).toBeVisible();
  await expect(page.locator(".sidebar-mascot img")).toHaveAttribute("src", /^data:image\/png;base64,/);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Companion", exact: true }).click();
  await page.getByRole("button", { name: "Remove custom" }).click();

  await expect(page.getByRole("button", { name: "Custom", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Dog" })).toHaveClass(/is-selected/);
  await expect.poll(() => companionSettings(page)).toEqual({
    avatar: "dog",
    customName: null,
    enabled: true,
    hasCustomDataUrl: false
  });
});

test("keeps keyboard focus visible across main workflows and inline confirmations", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Dictation language").focus();

  await tabUntilFocused(page, page.getByRole("button", { name: "Dictation", exact: true }), { key: "Shift+Tab" });
  await expectVisibleFocus(page);

  await tabUntilFocused(page, page.getByRole("button", { name: "Start dictation", exact: true }));
  await expectVisibleFocus(page);

  await page.getByRole("button", { name: "History", exact: true }).click();
  await tabUntilFocused(page, page.getByLabel("Search local history"));
  await expectVisibleFocus(page);
  await tabUntilFocused(page, page.locator(".session-item", { hasText: "Seeded Local Dictation" }).getByRole("button", { name: "Copy final text" }));
  await expectVisibleFocus(page);
  await page.getByRole("button", { name: "Clear local history" }).click();
  await tabUntilFocused(page, page.getByRole("button", { name: "Cancel" }));
  await expectVisibleFocus(page);

  await page.getByRole("button", { name: "Dictionary" }).click();
  await tabUntilFocused(page, page.getByLabel("Dictionary term"));
  await expectVisibleFocus(page);
  await page.keyboard.type("FocusTerm");
  await tabUntilFocused(page, page.getByRole("button", { name: "Add term" }));
  await expectVisibleFocus(page);
  await tabUntilFocused(page, page.getByLabel("Snippet trigger"));
  await expectVisibleFocus(page);

  await page.getByRole("button", { name: "Settings" }).click();
  await tabUntilFocused(page, page.getByRole("button", { name: "Hotkeys" }));
  await expectVisibleFocus(page);
  await page.getByRole("button", { name: "Local Engine" }).click();
  await tabUntilFocused(page, page.getByRole("button", { name: /Medium tier/i }));
  await expectVisibleFocus(page);
});

async function tabUntilFocused(page: Page, locator: Locator, options: { key?: "Tab" | "Shift+Tab"; maxTabs?: number } = {}) {
  const key = options.key ?? "Tab";
  const maxTabs = options.maxTabs ?? 30;
  const visited: string[] = [];

  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press(key);
    visited.push(await activeElementLabel(page));
    if (await locator.evaluate((node) => node === document.activeElement).catch(() => false)) return;
  }

  throw new Error(`Unable to reach ${locator} with ${key}. Visited: ${visited.join(" -> ")}`);
}

async function activeElementLabel(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return "none";
    const label = active.getAttribute("aria-label") || active.getAttribute("title") || active.textContent?.trim() || active.tagName;
    return `${active.tagName.toLowerCase()}[${label}]`;
  });
}

async function companionSettings(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("dictivo-settings-v4");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      companionAvatar?: string;
      companionEnabled?: boolean;
      customCompanionAvatar?: { dataUrl?: string; name?: string } | null;
    };

    return {
      avatar: parsed.companionAvatar ?? null,
      customName: parsed.customCompanionAvatar?.name ?? null,
      enabled: parsed.companionEnabled ?? null,
      hasCustomDataUrl: Boolean(parsed.customCompanionAvatar?.dataUrl?.startsWith("data:image/png;base64,"))
    };
  });
}

async function expectVisibleFocus(page: Page) {
  const outline = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const styles = getComputedStyle(active);
    return {
      outlineStyle: styles.outlineStyle,
      outlineWidth: Number.parseFloat(styles.outlineWidth)
    };
  });

  expect(outline).not.toBeNull();
  expect(outline!.outlineStyle).not.toBe("none");
  expect(outline!.outlineWidth).toBeGreaterThanOrEqual(2);
}
