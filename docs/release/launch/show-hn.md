# Show HN — Launch Post

> The single most important piece of launch copy. You only get one Show HN per product, and the title determines whether anyone scrolls. Write it, edit it, sleep on it, ship it.

## Posting day

- **Day**: Tuesday, Wednesday, or Thursday
- **Time**: 08:00–10:00 US Eastern (= 14:00–16:00 CET)
  - This puts your peak window across the entire US workday plus EU afternoon
  - Avoid Fridays (front-page rotates faster, weekend = lower-quality readers), Mondays (HN is busy catching up on weekend posts)
- **Channel**: https://news.ycombinator.com/submit
- **Tag**: prefix the title with `Show HN:`

After posting, **do not** ask friends to upvote (HN detects and shadowbans). Do not post the link to anywhere coordinated within the first 6 hours.

---

## Title — pick one

Best candidates ranked by what HN actually rewards (specific, contrarian, useful):

1. **`Show HN: Dictivo – Voice dictation that never leaves your laptop ($49 once)`**
   - Specific (price). Implicit position vs subscriptions. 64 chars.
2. **`Show HN: Whisper-grade voice dictation, fully offline, no subscription`**
   - Capability + the two things HN privacy crowd cares about. 70 chars.
3. **`Show HN: I built a buy-once voice dictation app to replace Wispr Flow`**
   - Names the competitor; some risk, but instant context. Drops "Wispr" if you'd rather not.
4. **`Show HN: Dictivo – Local Whisper dictation in a single hotkey`**
   - Mechanic + tech stack hint. 60 chars.

**Recommend #1.** Includes the price (signals real product, not toy), names the product, says the two contrarian things ("never leaves" + "once"). The dollar sign survives HN's title hygiene.

Do not use: marketing fluff, emoji, ALL CAPS, exclamations, "introducing".

---

## Body — the comment that posts with the link

HN's first comment from the OP is read by everyone who clicks through. It sets context and replaces the lack of marketing copy. Aim for ~180 words.

```
Hi HN — I'm the (solo) maker of Dictivo. It's a Mac voice-dictation app
that runs whisper.cpp locally. Hold a hotkey, talk, release, and the
polished text lands wherever your cursor is. Nothing about your audio,
your transcripts, or your dictionary ever leaves the laptop.

There are two reasons it exists. (1) The subscription-priced voice
keyboards (Wispr Flow, Superwhisper Lifetime) keep getting more
expensive while doing less than what runs on-device today. (2) The
"local" alternatives mostly assume you'll fiddle with a Python script;
I wanted my non-engineer partner to install one DMG and have a working
hotkey in 60 seconds.

Pricing: $49 once. The first 12 months of new versions + new
transcription models are included. After that, the version you have
keeps working forever — you can optionally renew for $24 to keep
getting new models. No subscription, no telemetry, no cloud round-trip.

Free tier with the `tiny` Whisper model if you want to try first.

Happy to answer anything about the architecture, model picks, the
"buy-once but make it sustainable" pricing math, or why I chose Tauri.
```

Customizations before posting:
- Replace "Mac" with "Mac (Windows is on the v1.1 roadmap)" if asked in comments — don't say it in the OP unless you've decided to launch both at once
- If launching Mac-only, expect Windows requests; that's fine, parking them as `+1 on the v1.1 list` is acceptable
- "non-engineer partner" — replace with your real anchor phrase, but keep something concrete and human; HN loves a story

---

## Expected comments + canned replies

Pre-write these so you respond in 60 seconds at the top of the thread, when it matters most.

### "Why $49 and not free / open source?"

> Because I want to ship the next 12 months of updates without a side
> job. whisper.cpp itself is MIT and stays MIT. The Tauri client around
> it is closed; I am open to revisiting that once revenue clears my
> bills. Nothing about the privacy story depends on the client being
> open — your audio never leaves the laptop regardless, and the binary
> ships signed + notarized so you can verify what you run.

### "How is it different from MacWhisper / Aiko / Superwhisper?"

> MacWhisper is a sibling I respect — the closest comparison. Dictivo
> ships with hotkey-driven dictation (not transcribe-a-file), auto-paste
> into the active app, a snippet/dictionary engine, and a one-time $49
> price that includes 12 months of updates instead of either a $79 Pro
> upfront or Superwhisper's subscription. Different design priorities,
> not really competing on the same axis.

### "What about Windows?"

> v1.1. I wanted to nail the Mac flow before splitting attention. If you
> want to be notified, drop your email at https://dictivo.app — single
> "Windows is ready" email, that's it.

### "Subscription is dishonest. You'll switch later."

> Counter-evidence: the EULA's perpetual-fallback clause is in writing
> (https://dictivo.app/eula). If I ever launch a separate Dictivo Cloud
> product, it'll be a separate purchase. Buying Dictivo today entitles
> you to Dictivo on your laptop, forever. I'd rather close the company
> than break this.

### "Does it really never phone home?"

> Two background calls, both off-able in Settings:
> - Once on launch + every 24h: GET /releases/latest/download/latest.json
>   from GitHub to check for a new version. Carries an Authorization
>   header with your license key if you've activated; no installation
>   ID, no telemetry, no device fingerprint.
> - Once on first activation: one POST to Lemon Squeezy to validate the
>   license key. After that the cached license is trusted offline
>   forever.
>
> Source-of-truth: https://dictivo.app/privacy

### "What's the model pipeline?"

> whisper.cpp via the GGML quantized models. The app autodetects your
> hardware on first run and picks a fast/medium/slow tier. M1 Pro+ gets
> `small.en` by default; older Intel falls back to `tiny.en`. You can
> override in Settings → Local Engine.

### "Can I dictate in [language]?"

> All 99 Whisper languages work out of the box; the punctuation/casing
> polish is best in English and improves for CJK with the spoken
> punctuation toggle. German, French, Spanish, Mandarin, Japanese,
> Korean: tested daily.

### "How does the 12-month-update window work mechanically?"

> Your license carries an `updates_until` field = purchase date + 365
> days, computed locally. The updater fetches `latest.json` from GitHub;
> if the build's `pub_date` is after your `updates_until`, the app says
> "an update is available but your window has ended — renew $24" and
> the install button stays disabled. Your current version keeps working
> regardless — including all transcription models you've downloaded.

### "Why Tauri instead of Electron?"

> Smaller bundle (Mac DMG is ~28 MB instead of ~120 MB), native
> webview, the whisper.cpp + macOS accessibility plumbing is in Rust
> so the perf path doesn't hop through Node. Trade-off: smaller plugin
> ecosystem; I've been happy with it.

---

## After posting — first 6 hours

- **Open HN in a tab, refresh every 5 minutes**. Reply to every comment within 10 minutes for the first hour. After that, hourly for 6 hours.
- **Tone**: factual, curious, defensive only when accusation is factually wrong (and even then, address the underlying concern first).
- **Never argue with downvotes**. Add a short edit ("Edit: …") to the original comment instead.
- **Do not delete comments**, even ones that hurt. HN sees deletions in the log.
- **If a critic finds a real bug**: thank them publicly, fix it within 24h, post a follow-up on the same thread with the fix commit link.

---

## What success looks like

- **Front page (top 30)** for 4+ hours
- **150+ comments**
- **20+ purchases that first day** (with $49 product, that's $1000 in your pocket)
- **2-3 quality writeups** linking to it within a week (MacStories, Sindre Sorhus retweet, indiehackers.com, Hacker Newsletter)

---

## What failure looks like, and what to do

- **<50 upvotes in first hour** = either the title is wrong or the time is wrong. Don't repost the same day. Wait 30 days, rewrite the title, try again.
- **Negative top comment within 30 minutes** = address it with grace and substance; this *often* converts to neutral and the thread recovers.
- **Front page but zero conversions** = the pricing page is broken or the demo GIF is missing. Diagnose with Plausible (if installed) or by manually clicking through the funnel.

The Show HN is the single best free distribution event you'll ever have. Use it once, well.
