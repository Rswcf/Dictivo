# Dictivo Top-Down 深度审查报告

审查日期：2026-05-12  
仓库：`/Users/mayijie/Projects/Code/033_Dictivo`

## 1. 产品与架构理解

Dictivo 是一个 local-first 桌面听写应用，核心用户路径是：

首次启动硬件扫描 -> 选择/下载本地 whisper.cpp 模型 -> 本地录音 -> 本地转写和轻量 polish -> 粘贴到当前应用 -> 保存本地历史 -> 后续通过热键复用。

架构边界：

- `packages/shared`：定义隐私 contract、语言列表、provider、会话类型和禁止进入后端的内容字段。
- `apps/desktop`：React UI、设置、历史、词典/snippets、onboarding、hotkey 状态、本地 bridge fallback、Playwright browser preview。
- `apps/desktop/src-tauri`：Rust 原生层，负责 whisper.cpp CLI、模型路径/下载/导入/删除、硬件 tier、benchmark cache、全局热键 probe、剪贴板保护、托盘和 companion window。
- `apps/api`：Fastify metadata-only API，只允许 session/usage/entitlement/billing metadata，不允许音频、转写文本、词典、snippet 或凭证。

关键数据流：

- 音频和转写内容：浏览器 `MediaRecorder`/WAV -> Tauri command -> 本地 whisper.cpp -> 本地 polish -> 本地 SQLite/localStorage；不进入 API。
- 后端 metadata：`clientSessionId`、provider、privacy mode、language、source、mode、duration、word count；由 privacy guard 拒绝 forbidden content fields。
- 模型状态：Rust 根据硬件、benchmark、fingerprint 和模型安装状态生成 Fast/Medium/Quality tier，再由桌面 UI 展示。

## 2. 功能覆盖清单

已审查范围：

- Onboarding：硬件扫描、推荐模型、下载/benchmark/calibration、skip、完成态、tier 文案、旧 cache 迁移相关测试。
- Dictation：开始/停止、WAV、local engine ready/blocked 状态、profile fallback、四种 mode、本地 polish、clipboard changed 保护、history 保存。
- Model/tier：Fast/Medium/Quality、withinBudget warning、Advanced catalog、select/download/delete/import、hardware class、env override、benchmark cache。
- Hotkeys：toggle/hold 解析、paste-last、重复快捷键去重、native global hotkey probe。
- History：搜索、空状态、复制 raw/final、Markdown export、clear、100 条上限、web fallback。
- Dictionary/Snippets：add/remove、空值、CJK/URL、polish replacement、prompt terms。
- Floating Companion：preview、独立窗口、avatar、hide event、状态快照、透明窗口配置、close-to-hide。
- Settings/Privacy/UX：engine、hotkeys、companion、privacy permissions、可访问标签、状态反馈、桌面布局。
- API/privacy：health、session、usage、entitlements、billing mock、webhook、rate limit、body limit、日志 redaction、forbidden fields。
- Build/packaging/CI：root build、Tauri config、bundle resources、GitHub Actions matrix、macOS app bundle。

## 3. Findings

### High - 已修复：API 拒绝合法 Vietnamese metadata

证据：`packages/shared` 和桌面 UI 支持 `vi`，Rust `whisper_language` 也支持 `vi`，但 API session schema 原先手写枚举漏掉 `vi`。这会让越南语听写 session metadata 被 `/v1/transcription/session` 拒绝。

修复：

- [apps/api/src/routes/transcription.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/transcription.ts:2)：API 改为复用 `SUPPORTED_LANGUAGES`。
- [apps/api/src/routes/transcription.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/transcription.ts:11)：`language: z.enum(SUPPORTED_LANGUAGES)`。
- [apps/api/src/routes/privacy.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/privacy.test.ts:25)：测试改为接受 Vietnamese local-only metadata。

### Medium - 已修复：Onboarding 完成态仍使用旧 Slow 文案和旧 optional tier 判断

证据：`RunnableTiers` 当前 fast/medium/slow 都是非 optional assignment，并通过 `withinBudget` 表示性能预算；旧完成态用 `tiers.fast && tiers.slow` 判断，且展示 “Slow”。

修复：

- [apps/desktop/src/components/OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:131)：完成态改为 `SetupSummary`。
- [apps/desktop/src/components/OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:145)：基于 `withinBudget` 生成文案。
- [apps/desktop/src/components/OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:160)：over-budget Quality 显示慢速提醒。
- [apps/desktop/tests/onboardingWizard.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/onboardingWizard.test.tsx:21)：mock tier 增加 `withinBudget`。
- [apps/desktop/tests/onboardingWizard.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/onboardingWizard.test.tsx:49)：断言 `Fast and Quality are also available`。

### Medium - 已修复：macOS transparent companion window 缺少 private API feature

证据：`npm run tauri:dev -w @dictivo/desktop` 原生启动时输出 warning：透明窗口需要启用 `macos-private-api`。这会影响产品承诺中的透明 floating companion。

修复：

- [apps/desktop/src-tauri/tauri.conf.json](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/tauri.conf.json:13)：启用 `macOSPrivateApi`。
- [apps/desktop/src-tauri/Cargo.toml](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/Cargo.toml:23)：Tauri feature 加入 `macos-private-api`。
- 重新执行 `tauri:dev` 后该 warning 消失，`tauri:build --bundles app` 可产出 `Dictivo.app`。

### Medium - 已修复：桌面入口加载 Google Fonts，违背 local-first/offline 预期

证据：`apps/desktop/index.html` 原先引用 `fonts.googleapis.com` 和 `fonts.gstatic.com`。虽然不会上传用户内容，但会造成应用启动外部网络请求，削弱 local-first 和离线可用性。

修复：

- [apps/desktop/index.html](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/index.html:1)：移除外部字体链接。
- [apps/desktop/src/styles/app.css](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/styles/app.css:27)：改为系统字体栈。
- [apps/desktop/src-tauri/tauri.conf.json](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/tauri.conf.json:44)：生产 CSP 从 `null` 收紧为本地资源和 Tauri IPC。
- [apps/desktop/src-tauri/tauri.conf.json](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/tauri.conf.json:45)：dev CSP 允许 Vite localhost/ws。
- [apps/desktop/tests/wireframeVisual.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/wireframeVisual.test.ts:17)：测试改为断言系统字体和无 Google Fonts。

### Low - 未修复：模型下载缺少磁盘空间 preflight

证据：[apps/desktop/src/components/OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:58) 明确标记 TODO。当前下载失败会进入 error 文案，但用户会在下载中途才发现磁盘不足。

建议：在 Rust 层增加可用空间查询 command，根据目标模型 size 预判并在 UI 下载前阻止。该项不阻塞当前 RC，因为下载失败路径有错误反馈，但会影响首次体验。

### Low - 未修复：Rust dead_code warnings

证据：`cargo test` 和 `tauri:build` 都报告 `predict_rtf_from_medium` 以及非当前平台 GPU helper dead_code warning。行为无误，但 release 输出不干净。

建议：对平台 stub 加 `#[allow(dead_code)]` 或按模块拆分；删除未使用的 `predict_rtf_from_medium`，前提是确认历史设计文档不再依赖。

## 4. 修复摘要

已修改：

- API language schema 与 shared 语言列表对齐。
- API privacy test 覆盖 Vietnamese metadata。
- Onboarding 完成态改为当前 tier shape 和 Quality 文案。
- Onboarding test 更新 `withinBudget` mock 和 Quality 断言。
- 移除 Google Fonts 远程依赖，改系统字体。
- 收紧 Tauri CSP，保留 dev HMR 所需连接。
- 启用 macOS transparent window 所需 private API feature。
- 更新 visual contract test，防止远程字体依赖回归。

## 5. 命令与结果

通过：

- `npm run build`：通过，desktop Vite build 成功。
- `npm run typecheck`：通过，shared/api/desktop TypeScript 检查成功。
- `npm run test`：通过，shared 5、desktop 54、api 8 个测试全部通过。
- `npm run e2e`：通过，8 个 Chromium desktop Playwright 用例全部通过。
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`：通过，26 个 Rust 单测通过，global hotkey probe 默认 ignored。
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test global_hotkey_probe -- --ignored --nocapture`：通过，交互式默认热键注册 probe 成功。
- `npm run tauri:dev -w @dictivo/desktop`：通过原生启动冒烟；手动中断，无后台进程遗留。
- `npm run tauri:build -w @dictivo/desktop -- --bundles app`：通过，产物为 `apps/desktop/src-tauri/target/release/bundle/macos/Dictivo.app`。

观察：

- Playwright 的 `NO_COLOR`/`FORCE_COLOR` warning 不影响结果。
- Rust dead_code warnings 不影响测试和打包。

## 6. 剩余原生/人工验证矩阵

这些不能仅靠 browser preview 证明，需要安装后的真实桌面环境：

| 场景 | 人工步骤 | 期望 |
| --- | --- | --- |
| 真实麦克风听写 | 启动打包 app，授权麦克风，下载/导入 small 模型，录音 5-10 秒 | 本地转写成功，history 更新，剪贴板/粘贴按预期 |
| OS 权限弹窗 | macOS/Windows 首次启动并触发麦克风、辅助功能、自动粘贴 | 权限文案和系统状态一致，不出现死路 |
| 真实 whisper.cpp 模型 | 使用 `DICTIVO_PRIVATE_FAST_HOME` 或 UI 下载/import 模型 | 模型列表、选中状态、benchmark、tier cache 正确 |
| 跨应用 hotkey | 在 Notes/TextEdit/浏览器输入框外部触发 start/stop 和 paste-last | 每次按压只触发一次，hold/release 行为正确 |
| Companion 原生窗口 | 启用 companion，录音/处理/完成/隐藏 | 透明、无边框、置顶、位置正确，托盘隐藏可用 |
| 剪贴板 race | 转写期间手动改剪贴板 | Dictivo 跳过自动粘贴，只复制结果并提示 |
| Windows 打包 | 在 Windows runner 或真机执行 MSI build/install | 模型路径、sendkeys、global shortcut、tray 行为正确 |

## 7. UX 优化建议

优先级 P1：

- Onboarding 下载模型前增加磁盘空间检查和预计下载大小提示。
- Settings -> Privacy 增加系统设置入口或平台专属指引，减少用户授权失败后的搜索成本。
- 模型下载/benchmark 增加更细粒度进度和取消/重试 affordance。

优先级 P2：

- History 增加单条删除和重新粘贴按钮；当前只有 clear all、copy/export。
- Dictionary/Snippets 增加重复检测和 inline validation，避免用户误以为添加失败。
- Settings 中 Advanced model catalog 可以显示当前 tier 对应关系，减少“高级模型”和“Fast/Medium/Quality”的认知断层。

优先级 P3：

- 把当前内联 style 逐步移入 CSS class，便于未来更严格 CSP。
- 对 Rust 平台 stub warning 做清理，让 CI/release 日志更干净。

## 8. Prompt-To-Artifact 完成度审计

| 要求 | 证据 |
| --- | --- |
| 读取并按 `docs/goal-dictivo-review.md` 执行 | 本报告覆盖该文件的架构、功能、测试、修复、输出格式和 DoD |
| Top-Down 架构理解 | 本报告第 1 节 |
| 10 个功能区审查 | 本报告第 2 节 |
| 修复真实问题 | 本报告第 3-4 节，涉及 API、onboarding、Tauri、字体/CSP |
| 为修复补测试 | `privacy.test.ts`、`onboardingWizard.test.tsx`、`wireframeVisual.test.ts` |
| 运行 required gates | 本报告第 5 节 |
| 运行/尝试 native validation | `global_hotkey_probe`、`tauri:dev`、`tauri:build` 均已执行 |
| 无云端用户内容回归 | API 仍由 privacy guard 保护；远程字体依赖已移除 |
| 中文最终报告 | 当前文件 |
| 剩余风险和人工验证步骤 | 本报告第 6-7 节 |

结论：当前自动化和本机可执行原生冒烟验证均通过；Critical/High 问题已修复。剩余项主要是真机麦克风、真实模型、OS 权限弹窗、Windows 安装包等需要人工/平台环境验证的问题。
