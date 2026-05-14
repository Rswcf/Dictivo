# Versioning Policy

Dictivo follows a deliberately small variant of [Semantic Versioning](https://semver.org/) so it is obvious from the version number what kind of change was just shipped. The policy is enforced by humans, not tooling — bump the right digit when you push.

## The rule

Version format: `MAJOR.MINOR.PATCH`

| Bump | When |
|---|---|
| **Patch** (`x.y.Z`) | Every push that ships a bug fix, a small UI / copy change, a small feature, or any single-area enhancement. This is the default. |
| **Minor** (`x.Y.0`) | A bigger refactor, a new top-level feature, or the start of an internal release cycle. Resets PATCH to `0`. |
| **Major** (`X.0.0`) | A breaking change for users, a re-architecture, or a marketing-level v2.0 launch. **Only the project lead bumps this.** Resets MINOR and PATCH to `0`. |

## What "every push" means in practice

A "push" here is a single `git push` to `main` that adds at least one functional commit (code, tests, config, or content the app reads at runtime). Multiple commits sharing one push share one PATCH bump.

If a push contains **only** repo-meta files — like `docs/`, the marketing-site assets, `*.md` updates, or files in `_v1-reference/` — leave the version alone. The version number tracks the **shipping app**, not the documentation.

When in doubt: it's a patch.

## Files that must be updated together when you bump

A single bump touches every place the version is declared. Doing them piecemeal will lead to package-lock drift and a confusing `About → Version` page. The full list:

```
package.json                              "version"
apps/desktop/package.json                 "version"
apps/desktop/package.json                 "@dictivo/shared" (^x.y.z)
apps/desktop/src-tauri/Cargo.toml         version
apps/desktop/src-tauri/tauri.conf.json    "version"
apps/api/package.json                     "version"
apps/api/package.json                     "@dictivo/shared" (^x.y.z)
packages/shared/package.json              "version"
package-lock.json                         (auto-update via npm install)
```

After bumping these by hand, run `npm install` from the repo root to refresh `package-lock.json` in one shot. The lockfile change must be committed in the same commit as the version bump.

## Tags

Patch and minor bumps **may** be tagged (`git tag v0.2.1`); they are not required to be. Major bumps **must** be tagged immediately after the bump commit lands and trigger the release-desktop workflow.

The convention: only tags release. Pushes without tags update the source-of-truth but do not produce a public installer.

## Examples

| Change | Bump |
|---|---|
| Rename a CSS class to align with the design tokens | patch |
| Rename `Bikini` avatar to `Iris` + migration code + tests | patch |
| Add Lemon Squeezy license activation flow + UI + tests + plugin deps | patch (small surface from the user's POV) or minor (significant new system); choose minor when in doubt |
| Add a second supported payment processor alongside LS, with a feature flag to switch | minor |
| Move from whisper.cpp to a different transcription engine; rewrite the local engine module | minor (or major if the API to other modules breaks) |
| Drop macOS 12 support; require macOS 14+ | major |
| 2.0 launch with a new product surface (e.g. Dictivo Cloud) | major (user-decided) |
| Fix a typo in `README.md` | no bump |
| Add a section to `docs/release/plan.md` | no bump |
| Update the marketing site (in the other repo) | no bump in this repo |

## The major-version decision

Only the project lead bumps MAJOR. The reasons:

- It usually involves marketing communication ("Dictivo 2.0 is out") that the lead must coordinate.
- It often coincides with a paid-upgrade event for users outside their update window, which has commercial implications.
- A wrongly-incremented major signals a re-architecture that didn't happen and confuses the user base permanently.

If a contributor or AI agent thinks a change should be major, they should propose it with a "MAJOR-PROPOSAL" line in the commit message and leave the version untouched until the lead confirms. The default for everything else stays patch / minor.

## Why this is stricter than vanilla SemVer

Strict SemVer ties bumps to backwards-compatibility of a public API. Dictivo is a closed-binary desktop app for end users; there is no external API to break, so the canonical SemVer trigger is meaningless. This policy substitutes "size of user-visible change" as the trigger instead, which is what the user actually cares about when they read the version number in `Settings → About`.

## Versioning the marketing site

The marketing site (`Rswcf/Dictivo-site`) does not need a synchronized version with this repo. It deploys continuously from its own `main`. Its `latest.json` mirror is intentionally derived from the desktop repo's GitHub Release flow, not from the site repo's deploy.
