# GitHub Documentation Research Notes

Research date: 2026-05-11

These notes summarize documentation patterns reviewed before rewriting the Dictivo GitHub documentation for a public launch.

## Repositories reviewed

| Source | What works | Applied to Dictivo |
| --- | --- | --- |
| [GitHub Docs: About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) | A README should explain what the project does, why it is useful, how to start, where to get help, and who maintains it. | The README now leads with product value, quick start, help paths, quality gates, and community guidance. |
| [Vite](https://github.com/vitejs/vite) | Short tagline, fast feature bullets, clear docs link, and contribution link. | Dictivo uses a compact tagline, a `Why Dictivo` table, and direct development commands instead of a long architecture-first introduction. |
| [Home Assistant](https://github.com/home-assistant/core) | Clear mission around local control and privacy, plus immediate links to demo, installation, tutorials, and docs. | Dictivo puts local-first privacy and installation paths near the top, because privacy is the main buyer/user reason to care. |
| [Ollama](https://github.com/ollama/ollama) | Download first, then get started, API examples, docs, libraries, and community. | Dictivo starts with release install and first dictation before deeper engine setup. |
| [Supabase](https://github.com/supabase/supabase) | Product promise, checklist-like capability overview, visual proof, docs, contribution, and support channels. | Dictivo uses capability tables and will be ready for screenshots/demo clips when release assets are available. |
| [LangChain](https://github.com/langchain-ai/langchain) | Positioning sentence, quickstart code, ecosystem map, and "why use it" reasoning. | Dictivo separates user quick start, developer commands, and product boundaries. |
| [LobeHub](https://github.com/lobehub/lobe-chat) | Strong multilingual navigation, product links, visual assets, table of contents, community calls to action, and feature depth. | Dictivo now includes multilingual entry points and a community/translation path without overloading the first screen. |

## Principles adopted

1. Lead with the user outcome, not the stack.
2. Put install and first successful action before developer internals.
3. Make privacy concrete by naming what never leaves the device.
4. Use tables for comparison and troubleshooting because they scan well on GitHub.
5. Provide localized entry points for markets where private dictation has clear demand.
6. Keep promises honest: do not add badges, screenshots, or release links until they exist.
7. Give contributors a narrow first path: issues, translation files, quality gates, and test matrix.
8. Keep the README short enough that GitHub's rendered outline remains useful.

## Next documentation upgrades

- Add a release screenshot and a 20-40 second demo clip once the signed builds are published.
- Add `SECURITY.md` and issue templates before opening the repository widely.
- Add a localized privacy page when the billing and entitlement metadata contract is finalized.
- Add a short comparison page for "Dictivo vs cloud dictation" after public positioning is locked.
