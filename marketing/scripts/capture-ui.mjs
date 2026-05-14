#!/usr/bin/env node
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:1420';
const OUT_DIR = new URL('../captures/ui/', import.meta.url);

const VIEWPORT = {width: 1920, height: 1200};

const seededSessions = [
  {
    id: 'session_demo_1',
    title: 'Q4 board prep',
    mode: 'message',
    language: 'en',
    privacyMode: 'local-only',
    provider: 'local-whisper',
    createdAt: '2026-05-13T09:14:00.000Z',
    durationSeconds: 28,
    wordCount: 64,
    rawText: 'send the q4 deck before standup',
    text: 'Send the Q4 deck before standup so we can lock the board narrative.',
  },
  {
    id: 'session_demo_2',
    title: 'Cursor notes',
    mode: 'message',
    language: 'en',
    privacyMode: 'local-only',
    provider: 'local-whisper',
    createdAt: '2026-05-13T08:42:00.000Z',
    durationSeconds: 16,
    wordCount: 31,
    rawText: 'remember to refactor the auth middleware',
    text: 'Remember to refactor the auth middleware before the freeze.',
  },
];

const SETTINGS = {
  selectedTier: 'medium',
  onboardingCompleted: true,
  companionEnabled: true,
  companionAvatar: 'dog',
};

async function shoot(page, name) {
  const path = new URL(`./${name}.png`, OUT_DIR).pathname;
  await page.screenshot({path, type: 'png'});
  console.log(`  ✓ ${name}.png`);
}

async function main() {
  await mkdir(OUT_DIR, {recursive: true});

  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // ───── 1. Onboarding · Step 1 (looking at hardware) ─────
  await page.addInitScript(() => localStorage.clear());
  await page.goto(BASE_URL);
  await page.getByText(/Looking at your computer/i).waitFor();
  await page.waitForTimeout(400);
  await shoot(page, '01-onboarding-scan');

  // ───── 2. Onboarding · Step 2 (tier recommendation) ─────
  await page.getByRole('button', {name: /Continue/i}).click();
  await page.getByRole('heading', {name: /Recommended for your hardware/i}).waitFor();
  await page.waitForTimeout(400);
  await shoot(page, '02-onboarding-tiers');

  // ───── 3. Main · Dictation workbench (idle) ─────
  await page.addInitScript(
    ({sessions, settings}) => {
      localStorage.clear();
      localStorage.setItem('dictivo-local-sessions', JSON.stringify(sessions));
      localStorage.setItem('dictivo-settings-v4', JSON.stringify(settings));
    },
    {sessions: seededSessions, settings: SETTINGS},
  );
  await page.goto(BASE_URL);
  await page.getByRole('heading', {name: 'Dictation'}).waitFor();
  await page.waitForTimeout(500);
  await shoot(page, '03-dictation-idle');

  // ───── 4. Main · transcript filled ─────
  await page
    .getByLabel('Live dictation text')
    .fill('Send the Q4 deck before standup so we can lock the board narrative.');
  await page.waitForTimeout(200);
  await shoot(page, '04-dictation-transcript');

  // ───── 5. History view (real local sessions) ─────
  await page.getByRole('button', {name: 'History', exact: true}).click();
  await page.getByRole('heading', {name: 'Local History'}).waitFor();
  await page.waitForTimeout(300);
  await shoot(page, '05-history');

  // ───── 6. Dictionary & snippets ─────
  await page.getByRole('button', {name: 'Dictionary'}).click();
  await page.getByRole('heading', {name: 'Dictionary & Snippets'}).waitFor();
  await page.getByPlaceholder('Supabase, 张伟, kubectl...').fill('whisper.cpp');
  await page.getByRole('button', {name: 'Add term'}).click();
  await page.getByPlaceholder('Supabase, 张伟, kubectl...').fill('large-v3-turbo-q5');
  await page.getByRole('button', {name: 'Add term'}).click();
  await page.getByPlaceholder('my calendar link').fill('cal');
  await page.getByPlaceholder('https://...').fill('https://cal.com/yijie/30min');
  await page.getByRole('button', {name: 'Add', exact: true}).click();
  await page.waitForTimeout(300);
  await shoot(page, '06-dictionary');

  // ───── 7. Settings · Local Engine (tier cards in real UI) ─────
  await page.getByRole('button', {name: 'Settings'}).click();
  await page.getByRole('button', {name: 'Local Engine'}).click();
  await page.waitForTimeout(400);
  await shoot(page, '07-settings-local-engine');

  // ───── 8. Settings · Privacy panel ─────
  await page.getByRole('button', {name: 'Privacy', exact: true}).click();
  await page.waitForTimeout(300);
  await shoot(page, '08-settings-privacy');

  // ───── 9. Settings · Companion (dog selected) ─────
  await page.getByRole('button', {name: 'Companion', exact: true}).click();
  await page.waitForTimeout(300);
  await shoot(page, '09-settings-companion');

  // ───── 10. Settings · Hotkeys ─────
  await page.getByRole('button', {name: 'Hotkeys'}).click();
  await page.waitForTimeout(300);
  await shoot(page, '10-settings-hotkeys');

  // ───── 11. Companion visible on workbench ─────
  await page.getByRole('button', {name: 'Dictation', exact: true}).click();
  await page.waitForTimeout(500);
  await shoot(page, '11-dictation-with-companion');

  await browser.close();
  console.log('\nDone. Captures in marketing/captures/ui/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
