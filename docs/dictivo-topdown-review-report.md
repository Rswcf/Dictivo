# Dictivo Top-Down 深度审查报告

审查日期：2026-05-13
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
- Dictation：开始/停止、WAV、local engine ready/blocked 状态、profile fallback、默认 Message 输出、Processing toggles、本地 polish、clipboard changed 保护、history 保存。
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

### Low - 已修复：模型下载/导入缺少磁盘空间 preflight

原问题：Onboarding 和 Settings 都会调用同一个 native 模型下载命令；旧 `download_model` 会直接运行 whisper.cpp 下载脚本或 curl，没有在写入目标模型目录前检查可用空间。用户只能在下载中途收到失败。

修复：在 Rust 模型下载/导入命令层增加模型预估体积、源文件体积和 `fs2::available_space` 预检，并保留 256 MB safety margin；Onboarding 和 Settings 的 download/import 路径都会在写入模型目录前被同一逻辑保护。错误信息包含模型名、所需空间、可用空间和目标目录。

### Low - 已修复：Rust dead_code warnings

证据：`cargo test` 和 `tauri:build` 都报告 `predict_rtf_from_medium` 以及非当前平台 GPU helper dead_code warning。行为无误，但 release 输出不干净。

修复：将只被测试引用的预测 helper 限定为 `#[cfg(test)]`，并删除非目标平台 GPU helper stub；调用点已经由 `#[cfg(target_os = ...)]` 保护。

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

2026-05-13 最新通过：

- `npm run lint`：通过；shared/API/desktop 三个 workspace 都执行 `tsc --noEmit`。
- `npm run build`：通过；shared、API、desktop build 全部成功。
- `npm run typecheck`：通过；shared/API/desktop 均执行源码级 TypeScript 检查，API/desktop 不依赖 `packages/shared/dist`。
- `npm run test`：通过；shared 5、desktop 172、API 16 个 Vitest tests 全部通过。
- `npm run e2e`：通过；9 个 Chromium desktop Playwright 用例全部通过。
- `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`：通过，Rust 源码格式化归一。
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`：通过；40 个 Rust 单测通过，`global_hotkey_probe` 1 个交互式 probe 按设计 ignored。
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test global_hotkey_probe -- --ignored --nocapture`：通过；当前 macOS 环境可 reserve 默认全局快捷键。
- `npm run smoke:private-fast`：通过；安装包版本、macOS Microphone/AppleEvents usage descriptions、安装包内置 whisper.cpp binary + 本地 Private Fast 模型 + benchmark 音频可真实转写，并断言不会回归 `/dev/null.txt` 输出错误。
- `npm audit --audit-level=moderate`：通过，`found 0 vulnerabilities`。
- `git diff --check`：通过，无 whitespace error。
- `npm run tauri:build -w @dictivo/desktop -- --bundles app`：通过，构建 `Dictivo.app` 0.2.0。
- `/Applications/Dictivo.app`：已用最新 bundle 覆盖安装，版本 `0.2.0`；启动/退出 smoke 通过；`/Applications`、`~/Applications`、Desktop、Downloads、Trash、`/Volumes` 和 Spotlight bundle-id 复扫只发现这一份可打开的 Dictivo app；旧 bundle-id 运行残留 `~/Library/Caches/dictivo` 与 `~/Library/WebKit/dictivo` 已删除。

观察：

- Playwright 的 `NO_COLOR`/`FORCE_COLOR` warning 已在后续审计中清理，当前 E2E 输出干净。
- Rust dead_code warnings 已在后续审计中清理。

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
| Windows 打包 | 在 Windows runner 或真机执行 NSIS `.exe` current-user install 和 MSI managed install | 模型路径、sendkeys、global shortcut、tray 行为正确；公司电脑优先验证 `.exe` 是否避免不必要的 IT 授权 |

## 7. UX 优化建议

优先级 P1：

- 模型下载/benchmark 仍可进一步增加真实进度百分比和取消能力；当前已补充低磁盘预检和失败后明确重试入口。

优先级 P2：

- History 单条删除、复制 raw/final、重新粘贴、export 和 clear-all 已覆盖；后续可考虑批量导出。
- Settings 中 Advanced model catalog 后续可考虑加入模型磁盘位置打开入口；当前已显示模型和 Fast/Medium/Quality tier 的对应关系。

优先级 P3：

- 用户可见前端源码里的内联 `style={{...}}` 已迁移到 CSS class；后续新 UI 改动继续保持该约束，便于未来更严格 CSP。
- 继续把 release / test 日志中的新 warning 当作低风险但必须归零的质量问题处理。

## 8. Prompt-To-Artifact 当前完成度审计

目标拆解为可验证交付物：

| 明确要求 | 当前证据 | 状态 |
| --- | --- | --- |
| Top-down 理解产品、架构、数据边界 | 本报告第 1 节；[docs/test-matrix.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/test-matrix.md:1) | 已覆盖 |
| 审查 10 个功能区 | 本报告第 2 节逐项覆盖 Onboarding、Dictation、Model/tier、Hotkeys、History、Dictionary/Snippets、Companion、Settings/Privacy/UX、API/privacy、Build/packaging | 已覆盖 |
| 修复发现的 Critical/High/Medium/有意义 UX 问题 | 本报告第 3、4、9 节；涉及 API `vi` schema、Onboarding tier 文案、CSP/remote fonts、macOS transparent window、文档 drift、History 删除/粘贴、Settings validation、权限入口、模型磁盘预检、inline confirm 等 | 已覆盖 |
| 为变更补测试 | 新增/扩展 `docsConsistency.test.ts`、`componentsInteraction.test.tsx`、`settingsInteraction.test.tsx`、`modelManagerInteraction.test.tsx`、`onboardingWizard.test.tsx`、`privacySettings.test.ts`、Rust private_fast/lib/storage tests | 已覆盖 |
| Required gates | 2026-05-13 最新复跑：`npm run lint`、`npm run build`、`npm run typecheck`、`npm run test`、`npm run e2e`、`cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`、`cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`、`npm audit --audit-level=moderate`、`git diff --check` 全部通过；Vitest 为 shared 5、desktop 172、API 16，Rust 为 40 passed + 1 ignored probe，E2E 为 9 passed | 已覆盖 |
| Native/package validation | 2026-05-13 最新复跑 `npm run tauri:build -w @dictivo/desktop -- --bundles app`；`/Applications/Dictivo.app` 已覆盖安装为 `0.2.0`；启动/退出 smoke 通过；系统常见安装位置只发现这一份 Dictivo 安装副本，旧 bundle-id 运行残留 `~/Library/Caches/dictivo` 和 `~/Library/WebKit/dictivo` 已删除；`npm run smoke:private-fast` 现在验证安装包版本和 macOS Microphone/AppleEvents usage descriptions；[NATIVE-001](/Users/mayijie/Projects/Code/033_Dictivo/docs/native-manual-test-plan.md:69) 已记录为 Pass；[NATIVE-002/003/004/005/006/007/008/009/010/011/012/013/014/016/017/018](/Users/mayijie/Projects/Code/033_Dictivo/docs/native-manual-test-plan.md:70) 更新为 Partial automated | 本机 macOS 冒烟已覆盖 |
| Native whisper.cpp smoke | `npm run smoke:private-fast` 固化安装包内置 binary + 本地模型 + benchmark 音频的真实转写验证，覆盖模型路径、输出文件、样本文本和 `/dev/null.txt` 回归 | 本机 macOS 冒烟已覆盖 |
| 隐私承诺不回归 | API forbidden-content guard、shared privacy tests、CSP/remote font 清理、非 Tauri microphone 状态修正、Tauri runtime browser microphone permission merge、metadata-only API 测试均通过 | 已覆盖 |
| 当前产品文档不宣传已移除主模式切换/旧 hotkey | README 与三份本地化 README 已更新；`docsConsistency.test.ts` 防回归 | 已覆盖 |
| 剩余原生/人工验证 | 本报告第 6 节、[docs/test-matrix.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/test-matrix.md:36) 和 [docs/native-manual-test-plan.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/native-manual-test-plan.md:1) 记录真实麦克风、OS 权限弹窗、跨应用 hotkey 行为、Companion 原生窗口、真实剪贴板 race、真实 tray 点击、Windows 安装/运行；microphone denial app handling、language/dictionary/snippet app wiring、clipboard race app handling、默认快捷键 reserve、hold repeat suppression、paste-last app wiring、Windows MSI/NSIS workflow contract、Windows quiet child command wiring、packaged whisper smoke、安装包 metadata smoke、tray action mapping、模型操作锁/低磁盘预检和隐私网络/API guard 已有 partial automated 证据 | 未能自动关闭 |

结论：当前自动化、本机 macOS 构建安装和可执行原生冒烟验证都通过，且已修复本轮能在当前环境中确认的真实缺陷。Goal 仍不能标记完成，因为 `docs/goal-dictivo-review.md` 明确要求覆盖真实麦克风、真实模型、OS 权限、跨应用热键和平台差异；这些需要真实授权、模型文件和/或 Windows/Linux 环境，当前本机自动化不能证明。

## 9. 2026-05-13 跟进审计

目标：继续按“全面深度测试 -> 技术正确性 -> 用户可操作性 -> 发现问题后修复并复测”的标准检查当前 `0.2.0` 状态，避免把已移除的旧功能当作当前功能继续宣传或测试。

本轮发现：

- Documentation drift：主 README、三个本地化 README 和 `docs/test-matrix.md` 仍描述已从主界面移除的 Message / Email / Raw / Prompt 模式切换。当前产品主路径是默认 Message 输出，并通过 Settings -> Local Engine -> Processing toggles 控制标点、填充词和大小写处理。
- Documentation drift：英文 README 仍宣传旧的 `⌥+Space` / `⌥+Shift+V` 默认快捷键，但当前默认值是 `CommandOrControl+Shift+Space` 和 `CommandOrControl+Shift+V`。
- Windows installer UX gap：release workflow 被锁到 `--bundles msi` 后只产出 MSI。MSI 更容易触发公司电脑的软件安装管控，缺少之前可用于当前用户安装的 NSIS `.exe` 路径。
- Native event lifecycle gap：`App` 与 `CompanionWindow` 的 Tauri `listen()` 注册是异步 promise；如果窗口/React tree 在 promise resolve 前卸载，返回的 cleanup 会丢失，后续可能留下 native event listener。
- Onboarding setup lifecycle gap：模型下载/setup 是不可取消的 async flow；如果 wizard 在下载 promise 结束前卸载，旧实现仍会继续 benchmark/finalize 并尝试更新已卸载的 React state。
- Rust hygiene：`cargo test` 仍输出 `dead_code` warnings，主要来自测试专用 prediction helper 和非当前平台 GPU helper stub。
- Test coverage gap：History / Dictionary 关键交互此前主要依赖静态渲染和 Playwright happy path，组件级用户操作覆盖不足。
- Tooling hygiene：root `lint` script 使用 `npm run lint -ws --if-present`，npm 提示 `-ws` 将来会移除；同时各 workspace 没有自己的 lint script，导致该门禁实际空跑。
- UX validation gap：Dictionary/Snippets 的空输入会被 App 忽略，但 UI 会清空输入，让用户误以为添加成功；重复 term / snippet trigger 也缺少明确阻止和反馈。
- Dictionary/Snippets app-state gap：页面子组件覆盖了 add/remove callback，但此前没有 App 级断言用户从主应用进入 Dictionary 后新增/删除 term 和 snippet 会真实更新应用状态和空状态。
- Dictionary/Snippets language-scope gap：term/snippet 记录保存了 language，但 App 此前展示、重复检测和 local dictation prompt terms 都按全局列表处理；多语言用户的术语或片段可能污染另一个语言的听写。
- UX validation gap：Settings -> Hotkeys 的 recorder 允许普通字母作为全局快捷键，可能在其他应用中拦截正常输入；Settings 交互覆盖也偏低。
- Accessibility / state gap：Dictation Workbench 的 companion preview 容器标记为 `aria-hidden`，但内部有可聚焦 Hide 按钮；该按钮还直接 `remove()` DOM，绕过 React 状态，容易导致 UI 和设置状态不一致。
- UX validation gap：Settings -> Local Engine 的 `ModelManager` 接收了 refresh 回调但没有使用；用户在模型页面无法直接刷新模型状态，只能跳到 Privacy 页刷新，且模型选择/下载/删除/import 的组件级交互覆盖不足。
- Native safety gap：模型下载/导入前缺少磁盘空间预检；Onboarding 和 Settings 路径都会等到底层脚本/curl/copy 失败后才反馈磁盘不足。
- UX validation gap：Settings -> Privacy 虽然告诉用户权限需要去系统设置处理，但没有直接入口，也没有展示 `describePermissionStatus` 里的详情说明；被权限卡住的用户需要自己猜应该打开哪个系统页面。
- Privacy app-wiring gap：SettingsView 子组件覆盖了 `Open settings` / refresh callbacks，但此前没有 App 级断言 `openPermissionSettings()` 成功后显示状态、`requestNativePermissions()` 刷新后移除已解决权限的 action。
- Native accuracy gap：`request_permissions` 原先在安装版里也固定返回 `pending-native-prompt`，Privacy 页刷新后无法反映真实 Accessibility 状态，用户无法确认系统设置是否已经生效。
- Native permission platform coverage gap：权限设置入口是 release-critical 的卡点，但此前 Rust 单测只能覆盖当前编译平台分支；Windows `ms-settings:` 和 Linux `xdg-open` URI 只能靠人工或阅读代码发现漂移。
- Preview accuracy gap：非 Tauri 浏览器预览原先把 microphone 标成 `granted`，会让预览里的 Privacy 页面误导用户以为桌面麦克风权限已经可用。
- UX validation gap：Onboarding 的模型下载/校准失败后虽然可以再次点主按钮，但按钮仍写着 `Download & set up`，错误文本也没有 alert 语义；用户不容易知道这是可重试动作。
- Onboarding resilience gap：GPU 探测是辅助信息，但此前和硬件 profile 读取绑在同一个 `Promise.all`；GPU probe 失败会让整个硬件扫描失败并禁用 Continue。
- Onboarding busy-state gap：模型下载/setup 进行中仍可点 `Skip setup` 离开向导；底层下载/校准不是可取消操作，用户可能以为已跳过但后台任务仍继续运行。
- Onboarding catalog resilience gap：推荐模型 catalog 读取失败此前被静默吞掉；用户只能看到裸 model id，不知道模型名称/大小缺失是临时 catalog 问题，还是 setup 不可继续。
- UX validation gap：Settings -> Local Engine 的 Advanced model catalog 原先只显示原始模型列表，用户不容易理解每个模型对应 Fast/Medium/Quality 哪个 tier。
- CJK language UX gap：中文/日文按字符计数，但 Dictation footer 和 History metadata 仍显示 `words`，会让 CJK 用户误解计数含义；同时此前没有 App 级测试确认语言选择会传给本地听写和历史 metadata。
- UX validation gap：History 每条记录原先只能复制 raw/final 或导出，不能把某条历史记录直接重新粘贴到当前应用；用户需要手动复制再切换应用粘贴。
- Code hygiene gap：Settings -> Privacy 和 Settings -> Local Engine 仍有一批用户可见布局使用内联 `style={{...}}`，会增加后续 CSP 收紧和视觉维护成本。
- UX consistency gap：Settings -> Local Engine 的高级模型删除仍依赖 `window.confirm` 系统弹窗；它会阻塞页面、样式不可控，也和下载/超预算 tier 的 inline confirm 体验不一致。
- Storage consistency gap：History 的 browser fallback 会把同一 session id 重复插入，而 native SQLite 使用 upsert；同时 native upsert 没有更新 `created_at`，重复保存同一 id 后排序可能停在旧时间。Native 侧也缺少 100 条上限、CJK/特殊字符和 legacy summary roundtrip 的单测证据。
- Test isolation gap：新增 native storage 单测后，专项测试通过，但全量 `cargo test` 并行运行时多个 storage tests 会同时修改 `DICTIVO_DB_PATH`，导致临时数据库串线和 flaky failure。
- API privacy/security gap：privacy guard 只挂在 transcription/usage，billing checkout 和 Stripe webhook 如果误带 `transcriptText`、`dictionary` 等 forbidden content fields 不会被统一拒绝；同时缺少 CORS、body limit、rate limit 的自动化证据。
- API content-alias privacy gap：privacy guard 只按一组明确字段名查找内容；`content`、`rawText`、`promptTerms` 等常见别名此前不会被拦截，而且 exact-match 也无法覆盖 `transcript_text`、`prompt_terms` 这类 snake_case 变体；这些字段会在 Zod object 解析时被 strip，导致请求看似成功而不是按 metadata-only contract 明确拒绝。
- API schema strictness gap：transcription、usage 和 checkout Zod object 默认 strip unknown keys；即使 forbidden guard 没认出某个未来内容别名，未知字段也不应被 metadata API 静默接受。
- API route-order bug：`buildServer()` 同步注册 rate-limit plugin 后立刻注册 routes，实际 `inject` 连续 121 次 `/health` 仍返回 200，说明 rate-limit 的 onRoute hook 没覆盖当前 routes。
- API billing security gap：`STRIPE_WEBHOOK_SECRET` 已在配置中定义，但 Stripe webhook 路由没有验证 `stripe-signature`；任何客户端都能伪造 billing webhook metadata。
- UX hotkey gap：Settings 允许把 Dictation 和 Paste Last 设置成同一个快捷键；注册层会去重只注册一次，而事件解析优先 Dictation，导致 Paste Last 快捷键实际不可达。
- Hotkey display regression gap：用户曾指出 Settings 修改 hotkey 后主界面 `Hold and speak` / 快捷键展示没有同步；此前只有 Settings 子组件和纯函数测试，没有 App 级断言 Settings 改动会回流到 Dictation Workbench 的 quick tips 与 capture hint。
- Hold-hotkey repeat gap：Hold 模式依赖 `isDictatingRef` 判断 repeated keydown；但 `startDictation()` 此前只更新 React state，快速重复 Pressed 事件可能在 ref 同步前重复启动录音。
- Recording setup race gap：`startAudioRecording()` 是异步初始化；如果用户或全局热键在 microphone controller 创建前立即触发 Stop，旧逻辑会报 `No active recording was found.`，而稍后 resolve 的 controller 可能悬挂后台录音。
- Paste-last app-wiring gap：Paste Last 热键此前有 mapping 和失败反馈覆盖，但缺少 App 级成功路径断言，不能证明热键会从最新历史记录取 final transcript 并调用本地 paste bridge。
- Microphone denial UX gap：录音启动失败时旧逻辑已经把 editor 改成 `Recording locally...`，catch 只显示错误，不恢复启动前文本；用户可能误以为麦克风仍在录音。
- Clipboard race app-wiring gap：本地 paste bridge 已支持 `clipboard-changed-copied`，但此前缺少 App 级证据证明听写完成时会带着录音前 marker 调用 paste、保留 transcript、保存 history，并给用户解释为何跳过自动粘贴。
- Processing app-wiring gap：Processing toggles 是移除旧模式切换后的核心微调入口；此前只有 Settings 子组件回调和 local polish 纯函数覆盖，没有 App 级证据证明 Settings 里的 toggle change 会进入下一次 local dictation options。
- Settings migration gap：v4 settings 从 localStorage 直接 merge JSON，没有校验 language、selectedMode、selectedTier、companionAvatar、activationMode 或 boolean toggles；损坏/旧扩展字段会进入 UI 状态。
- Settings data-shape gap：settings migration 只检查 `dictionary` / `snippets` 是否为数组，没有校验数组内的 term/snippet 记录；损坏 localStorage 或旧格式 string[] dictionary 可能把坏数据带进 Dictionary UI 和 local polish。
- Settings hotkey migration gap：旧 settings 或损坏 settings 仍可能保存无主 modifier 的快捷键（如 `Shift+K`）或重复快捷键；UI 阻止新输入，但启动加载时仍会注册不安全或不可达的组合。
- UX reliability gap：History 的 Copy raw/final 按钮直接调用 `navigator.clipboard.writeText` 且不处理失败；Playwright 复测在 Chromium 预览中真实触发 `Write permission denied`，用户只能看到底层异常，且桌面版没有使用已有原生 clipboard 能力。
- History app-wiring regression gap：用户曾反馈 History 删除按钮显示成功但内容没有删除；此前覆盖了 HistoryView callback、browser/native storage 和 E2E 导航，但缺少 App 级断言点击单条删除/clear-all/copy raw/copy final/paste final 会调用 bridge、重新读取列表或更新主界面状态。
- History export E2E gap：Markdown export helper 有纯函数测试，History 页面也渲染按钮，但此前没有 browser-level 证据证明点击 `Export markdown` 会生成正确文件名和内容的下载。
- History export filename safety gap：Markdown export 此前直接用 `session.id` 拼接下载文件名；正常新数据可用，但旧缓存/损坏数据若含路径分隔符、控制字符、跨平台保留名或过长 id，下载文件名会依赖浏览器隐式清理而不稳定。
- Storage resilience gap：browser preview 的 History fallback 对 `dictivo-local-sessions` 直接 `JSON.parse`，localStorage 损坏或混入畸形记录时会让历史加载/保存/删除路径抛异常，而不是清理坏数据后继续工作。
- History schema validation gap：browser preview 的 History fallback 此前只检查字段类型，不校验 `language`、`mode`、`provider`、`privacyMode` 是否是当前产品支持的枚举；旧版本或坏缓存可能把无效 session 带进 History UI。
- History empty-state UX gap：首次使用或清空历史后，History 仍显示 `No local dictations match this search.`；没有搜索条件时这会让用户误以为自己正在过滤结果。
- Startup resilience gap：App 启动时 `listLocalSessions()` 和 `refreshNativeState()` 都是 fire-and-forget；如果本地历史数据库或 native 状态读取失败，会变成未处理 promise rejection，没有用户可见状态。
- Tier activation gap：Local Engine tier 切换在 `selectPrivateFastModel()` 失败后不会回滚 `selectedTier`，用户会看到 UI 已切到新 tier，但底层模型没有激活；下载后还继续使用旧的 tier mapping 进行选择。
- Tier calibration gap：点击下载 Fast 或 Quality tier 后，UI 会把该 tier 的 benchmark 结果传给 `finalizeCalibration`；Rust 端该 command 明确把输入当作 Medium RTF，导致 Medium baseline 和预测 tier cache 被污染。
- History concurrency gap：History copy/paste/delete 运行时没有统一锁住所有 destructive actions；复制剪贴板过程中仍可删除记录，容易造成状态交叉。
- Model operation concurrency gap：模型 download/delete/select 运行时，Local Engine 仍允许点击其它 tier 或 import 模型，可能并发写模型目录和 selected-model 状态。
- Local Engine app-wiring gap：ModelManager 子组件覆盖了 delete/import 回调和路径 trim，但此前没有 App 级断言 Advanced catalog 的 delete/import 会调用 native bridge、刷新模型列表并显示成功状态。
- Local Engine startup resilience gap：启动时 `getRunnableTiers()` 失败会被静默吞掉；用户无法知道 tier cache 未加载，Settings -> Local Engine 只会显示占位 tier 状态。
- Onboarding return-path gap：从 Settings -> Local Engine 点击 `Run setup wizard instead` 后，wizard 的 `Start dictating` / `Skip setup` 只关闭 onboarding，不会回到 Dictation；用户会停留在 Settings，和按钮文案不一致。
- Onboarding calibration dead-end：下载成功后如果 benchmark/finalize 失败，UI 已进入 `calibrate` step，但该 step 没有错误和 retry 按钮，用户会卡在 Quick calibration 页面。
- Hotkey reliability gap：`pasteLastTranscript` 由全局热键触发时没有捕获 `pasteText()` 失败；剪贴板/自动粘贴失败会形成未处理 promise rejection，用户没有可见反馈。
- Storage cleanup gap：App 启动保存 settings 前直接清理旧 `dictivo-settings-v2`，绕过 `settingsStore` 的 try/catch；当 storage cleanup 被浏览器/系统阻止时会影响渲染路径。
- Dictation completion gap：转写成功后如果自动粘贴失败或 history 保存失败，旧逻辑会进入整体 `catch` 并把听写标成失败；用户可能看不到已经生成的最终 transcript。
- CI gate drift：GitHub desktop release workflow 只跑 TypeScript、Vitest、全局 hotkey probe 和打包；没有跑普通 Rust 单测、Rust format check、Playwright browser-preview E2E、dependency audit、whitespace check，也没有显式跑 root lint，和本地 release gate 不一致。
- Native benchmark hygiene gap：真实 whisper.cpp CLI 复现发现 `benchmark_tier` 使用 `-of /dev/null` 会让 whisper.cpp 尝试写 `/dev/null.txt` 并输出 `open: failed to open`；退出码仍为 0，但 benchmark 依赖了有副作用的无效输出 stem。
- Native smoke repeatability gap：真实 whisper.cpp smoke 原先是临时 shell 命令，不能作为后续 release 前的稳定检查入口。
- Native smoke script testability gap：`smoke-private-fast.mjs` 已成为发布前真实验证入口，但此前关键断言只能在真实安装包/模型存在时跑到；脚本自身的 transcript 判断、plist metadata 判断和模型扫描优先级缺少常规单测防回归。
- Native manual plan gap：剩余麦克风、OS 权限、跨应用 hotkey、companion 原生窗口和 Windows 行为原先只有矩阵级摘要，没有足够具体的 release 前执行步骤、测试数据和退出标准。
- E2E runtime blind spot：Playwright 只断言页面结果，browser `pageerror` 或 `console.error` 即使出现也不会让测试失败；UI 可能带着隐藏运行时错误通过 E2E。
- Browser privacy regression gap：browser-preview E2E 此前不阻止外部 network/WebSocket request；如果未来误加远程字体、图片、analytics 或 fetch，local-first 体验可能在自动化中悄悄回归。
- Native transcription privacy hygiene gap：Private Fast 转写失败时此前把 whisper.cpp stdout/stderr 原样返回给 UI；虽然当前参数通常抑制正常输出，但失败路径不应依赖底层工具不打印用户内容。同时如果 whisper.cpp 进程启动失败，已写入 work dir 的临时 WAV 输入文件不会被清理。
- Whisper prompt minimization gap：`transcribePrivateFast()` 此前把 snippet replacement（常见为 URL、邮箱模板或其它较长私有文本）和 snippet trigger 一起传给 whisper.cpp `--prompt`。replacement 不需要参与识别口述触发词，还会扩大本机进程参数中可见的私有文本面。
- Audio format coverage gap：真实麦克风权限前无法稳定自动化录音，但 WAV 编码格式此前没有纯函数测试；如果 RIFF/WAVE header、16 kHz mono PCM 或空录音输出回归，会等到真实 whisper.cpp 才暴露。
- Workspace test/build fragility：desktop/API workspace 级 typecheck/lint/test 直接运行时依赖 `packages/shared/dist` 已存在；干净环境或并行重建 shared 时，API TypeScript 和 workspace Vitest 可能解析不到 `@dictivo/shared`。
- Profile fallback coverage gap：Quality/Balanced 转写失败后降级 Fast 的关键逻辑此前只由 App mock 间接覆盖，没有直接断言 Fast 失败会向用户暴露、慢速提示会返回。
- Native package metadata gap：安装包 smoke 此前只验证 whisper.cpp 转写链路，没有自动证明已安装 app 的版本号和 macOS Microphone / AppleEvents usage descriptions 与当前 release 一致。
- Native resource contract gap：Tauri config 已声明 `resources/private-fast` 和 `benchmark-5s.wav`，但此前没有静态测试证明这些资源文件真实存在、manifest 指向的 CLI binary 存在、benchmark WAV 格式符合 whisper.cpp 预期。
- Private Fast packaging hygiene gap：`prepare-private-fast-engine.mjs` 此前不会清理上一次生成的 manifest、macOS `whisper-cli`、Windows `whisper-cli.exe` 或 DLL；在同一工作目录重复准备不同平台 bundle 时，旧平台 artifact 可能被误带进新安装包。
- Tray behavior coverage gap：Tray close/show/hide/quit 是桌面应用核心生命周期，但此前只有关闭窗口的 Rust 纯函数覆盖，tray 菜单 id 路由和左键点击 show-main 行为仍只能靠人工矩阵。
- Windows child-process UX gap：Private Fast 子进程已使用 no-window wrapper，但通用 Tauri 层的 Windows `powershell` 粘贴和 `cmd /C start` 设置入口仍直接使用 `Command::new`；Windows 桌面用户可能看到短暂控制台窗口闪烁。
- Release workflow contract gap：Windows installers 和 macOS universal app 的真实安装仍需目标系统，但仓库里此前没有完整测试锁定 Windows x64 / macOS universal matrix、bundle type、artifact path 和 release gate 顺序；发布 workflow 轻微漂移可能让 installer/app artifact 假通过或不产出预期产物。
- Interactive CI risk：`global_hotkey_probe` 明确 `#[ignore]` 且需要交互式桌面，但 desktop release workflow 此前在 push/tag CI 中无条件用 `--ignored` 运行它；headless runner 或已占用快捷键会让自动发布构建被非确定性交互探针阻塞。
- App failure-feedback coverage gap：Privacy `Open settings` 和 Local Engine import 的成功路径已有覆盖，但系统设置打不开、导入文件无效这两个常见失败分支此前缺少 App 级断言，容易回归成无提示或操作锁不释放。
- Clipboard bridge coverage gap：App 层已经覆盖 clipboard marker race，但 bridge 层此前没有直接断言 `getClipboardMarker()` / `pasteText()` / `copyText()` 会把 marker 和文本精确转发到 Tauri commands；这会削弱跨应用粘贴保护的端到端证据链。
- MediaRecorder cleanup gap：compressed recording path 遇到 Recorder error 时会 reject，但没有清理 microphone tracks；虽然主听写当前使用 WAV，这个备用路径仍可能导致浏览器预览/未来压缩录音占用麦克风。
- WAV shutdown cleanup gap：主听写使用的 WAV recording path 此前没有 controller 级测试；如果 `AudioContext.close()` 在停止录音时失败，microphone tracks 可能不会释放，用户会遇到麦克风继续占用或下一次录音失败。
- WAV setup cleanup gap：主听写拿到 microphone stream 后，如果 `AudioContext` 或 audio node 初始化失败，旧逻辑会抛错但不释放 microphone tracks，导致真实麦克风被继续占用。
- Private Fast bridge coverage gap：`transcribePrivateFast()` 的 Tauri runtime path 负责 WAV 类型拦截、base64 编码和 dictionary/snippet prompt term 传递，但此前只覆盖了非 Tauri 阻断；硬件 profile、GPU、runnable tiers、benchmark、calibration 和模型 select/download/import/delete 的 Tauri invoke 参数也缺少桥接层断言。
- Companion positioning coverage gap：原生 companion 透明/置顶仍需真机验证，但窗口定位算法此前不可单测，负坐标副屏和小 work area 边界只能靠人工发现。
- Companion render coverage gap：`CompanionWindow.tsx` 是原生浮窗实际渲染入口，但 coverage 只覆盖到约 2%，没有组件级断言 `companion-state` 事件、recording timer、hide 请求、拖拽入口和不同 avatar/phase 的 DOM 输出。
- Companion entry coverage gap：用户要求“点击侧边栏图标弹出浮窗”，但此前 App 级测试只覆盖主界面的 companion preview，没有直接断言 sidebar mascot click 会拿到 Tauri `companion` window、定位、show 并 emit state，也没有断言 companion window 发回 hide request 后主窗口状态同步。
- Native permission surface gap：Tauri opener 插件和 `opener:default` capability 仍在打包配置里启用，但当前产品没有调用 JS opener；系统设置入口已经由原生 `open_permission_settings` command 处理，继续暴露 opener 会扩大不必要的桌面权限面。此前 capability 测试也只是检查包含必要权限，无法阻止未来悄悄加入额外 Tauri permission。
- Release workflow token-scope gap：desktop release workflow 上传 artifact 只需要读取代码，但此前没有测试锁定 GitHub token 权限为 read-only；未来误加 `contents: write`、`packages: write` 或 OIDC write 会扩大 CI 权限面。
- Accessibility labeling gap：顶栏语言选择、History 搜索、Dictionary/Snippet 输入、Dictionary term 删除按钮和 Local Engine 模型导入控件主要依赖空 label、placeholder、可见 token 文本或泛化的 `Remove` 文案；键盘和辅助技术用户无法稳定理解控件用途。
- Accessibility focus gap：普通按钮、icon button、settings tab、tier card 和 inline confirm 缺少统一 `:focus-visible` outline；键盘用户虽然能 Tab 到控件，但难以看出当前焦点位置。
- Button semantics gap：部分普通 `<button>` 和共享 `IconButton` 没有显式 `type="button"`，当前不在 form 内不会触发 bug，但未来包进 form 后可能产生意外 submit。
- Model import UX gap：Local Engine 的 Advanced import 在路径为空时仍可点击 `Import`，并且提交前没有统一 trim 用户复制路径时常见的首尾空格，会把可在 UI 层拦截/修正的路径错误推给原生层。
- 已解决的旧 UX 建议：History 单条删除已实现并有 web fallback、Rust storage、render contract 和 Playwright 覆盖；不再作为未修复 P2 项。

本轮修复：

- 更新 [README.md](/Users/mayijie/Projects/Code/033_Dictivo/README.md:43)、[docs/README.zh-CN.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/README.zh-CN.md:15)、[docs/README.ja.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/README.ja.md:15)、[docs/README.es.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/README.es.md:15)，移除对旧模式切换的用户承诺，并补齐当前默认快捷键 / Processing toggles 描述。
- 更新 [docs/test-matrix.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/test-matrix.md:9)，把 Dictation Workbench、History、Processing toggles、Local polishing 的覆盖范围改为当前产品行为。
- 新增 [docsConsistency.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/docsConsistency.test.ts:1)，防止用户可见文档重新宣传已移除的主模式选择器或旧默认快捷键。
- 新增 [componentsInteraction.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/componentsInteraction.test.tsx:1)，覆盖 History 搜索、复制、单条删除、clear-all 确认/取消、busy disabled 状态，以及 Dictionary/Snippets 的新增、清空输入和删除。
- 清理 [private_fast.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/private_fast.rs:347) 的 `dead_code` warnings：测试专用 helper 改为 `#[cfg(test)]`，非目标平台 GPU stub 删除。
- 更新 [package.json](/Users/mayijie/Projects/Code/033_Dictivo/package.json:17)，将 root `lint` script 改为 `npm run lint --workspaces --if-present`；并为 shared/API/desktop workspace 增加基于 strict TypeScript 的 `lint` script。
- 改进 [DictionaryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/DictionaryView.tsx:17) 和 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:555)：空输入/重复输入不再清空并静默失败，Add 按钮会禁用，重复项显示 inline validation；App 层也做重复保护。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：覆盖 App 级 Dictionary/Snippets 新增和删除状态流，确认 term/snippet 出现在 UI、删除后回到空状态。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:139) 和 [settingsStore.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/settingsStore.ts:265)：Dictionary/Snippets 展示、重复检测、settings migration dedupe 和 local dictation prompt terms 改为按当前语言隔离；`appStartup.test.tsx` 覆盖切换语言后只展示/传递对应语言的 term/snippet。
- 更新 [docs/test-matrix.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/test-matrix.md:11)，把 Dictionary/Snippets 的 empty/duplicate/partial-form 覆盖纳入矩阵。
- 改进 [SettingsView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/SettingsView.tsx:233)：快捷键录制现在要求至少一个 modifier，普通字母会显示 inline validation；Escape 会取消录制并清除错误。
- 新增 [settingsInteraction.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/settingsInteraction.test.tsx:1)，覆盖热键录制、modifier validation、Escape 取消、activation mode、processing toggles、companion 设置、privacy refresh 和版本展示。
- 更新 [docs/test-matrix.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/test-matrix.md:13)，把 Settings 热键、Companion、Privacy 的交互覆盖纳入矩阵。
- 改进 [DictationWorkbench.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/DictationWorkbench.tsx:139)：companion preview 不再用 `aria-hidden` 包含可聚焦按钮，Hide preview 改为 React 回调关闭 companion，而不是直接删除 DOM。
- 扩展 [componentsInteraction.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/componentsInteraction.test.tsx:1)，覆盖 Workbench 的开始听写、编辑转录、tier 切换、Resume from history、Companion hide preview。
- 改进 [ModelManager.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/ModelManager.tsx:95)：Local Engine 推荐卡现在直接提供 `Refresh status`，使用已有 native refresh 回调，减少用户跨页面找刷新入口的成本。
- 新增 [modelManagerInteraction.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/modelManagerInteraction.test.tsx:1)，覆盖 refresh、已安装 tier 直接切换、缺失模型下载确认、超预算 Quality 警告、Advanced catalog 的 select/delete/download、import path 和 busy disabled 状态。
- 更新 [docs/test-matrix.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/test-matrix.md:12)，把 Local Engine refresh 和模型管理交互覆盖纳入矩阵。
- 改进 [private_fast.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/private_fast.rs:160)：为每个 whisper.cpp 模型记录预估下载体积，并在 download/import 前检查目标模型目录可用空间，不足时提前返回可操作错误。
- 更新 [Cargo.toml](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/Cargo.toml:17)：加入 `fs2`，使用跨平台 available-space 查询。
- 更新 [OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:58)：移除已完成的磁盘空间预检 TODO。
- 改进 [SettingsView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/SettingsView.tsx:213)：Privacy 权限卡片现在显示状态详情，并对未就绪权限提供 `Open settings` 按钮。
- 新增 [desktopBridge.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/desktopBridge.ts:90) 的 `openPermissionSettings` bridge，web preview 会明确拒绝，避免伪装真实 OS 操作。
- 新增 [lib.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/lib.rs:62) 的 `open_permission_settings` command，macOS 打开 Microphone / Accessibility / Automation 对应 Privacy & Security 页面，Windows/Linux 有平台 fallback。
- 改进 [lib.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/lib.rs:65) 的 `request_permissions`：不再固定返回占位状态；macOS 会通过 `AXIsProcessTrusted` 读取真实 Accessibility 状态，其他平台显示 `not-required`，麦克风保持 `not-determined` 直到 WebView 录音权限流程触发。
- 改进 [lib.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/lib.rs:60)：权限设置命令映射抽成跨平台纯函数；Rust 单测现在在本机也能同时锁定 macOS Privacy pane、Windows `ms-settings:` 和 Linux `xdg-open` fallback 的 Microphone / Accessibility / Automation 目标。
- 改进 [desktopBridge.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/desktopBridge.ts:100)：非 Tauri 浏览器预览的 microphone 状态改为 `web-preview`，不再伪装成桌面权限已授权。
- 改进 [desktopBridge.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/desktopBridge.ts:108)：安装版 `requestNativePermissions()` 现在会在原生权限状态上合并 WebView/browser microphone permission API；如果能读到 `granted/denied/prompt`，Privacy 页会显示更接近真实麦克风授权的状态，API 不可用时保留原生状态。
- 改进 [SettingsView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/SettingsView.tsx:91)：Privacy 页只对 `denied`、`blocked`、`not-determined`、`not-verified` 等可通过系统设置处理的状态显示 `Open settings`；`web-preview`、`clipboard-only`、`not-required`、`granted` 不再显示无效按钮。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：覆盖 App 级 Privacy `Open settings` 和 `Refresh local status` 状态流，断言 `openPermissionSettings("accessibility")` 被调用、成功提示可见、刷新后 resolved permission action 被移除。
- 更新 [privacySettings.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/privacySettings.test.ts:1)，覆盖 `not-required`、denied 和 not-verified 的用户可读文案。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:263)：抽出 `handleOnboardingComplete`，wizard 完成或跳过后明确回到 Dictation，避免从 Settings 启动 setup 后停留在设置页。
- 改进 [DictationWorkbench.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/DictationWorkbench.tsx:60) 和 [HistoryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/HistoryView.tsx:92)：中文/日文计数标签显示为 `characters`，不再把字符数标成 words；`appStartup.test.tsx` 覆盖语言选择传入 local dictation 并保存到历史 metadata，`componentsStatic.test.tsx` 覆盖中文历史记录显示 `characters`。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：覆盖 Settings -> Processing toggles 关闭 Auto polish 后，下一次 dictation 会把 `localProcessing.autoPolish: false` 传给本地听写引擎。
- 改进 [OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:71)：setup 失败后主按钮文案改为 `Try setup again`，错误文本增加 `role="alert"`，让下载/磁盘空间/benchmark 失败后的重试路径更明确。
- 扩展 [onboardingWizard.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/onboardingWizard.test.tsx:1)，覆盖 setup 失败 alert 和随后重试成功。
- 改进 [OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:37)：GPU 探测失败现在只显示 `GPU · Not detected`，不阻断硬件 profile、推荐模型或 Continue；`onboardingWizard.test.tsx` 覆盖 optional GPU failure。
- 改进 [OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:120)：模型下载/setup 进行中禁用 `Skip setup`，避免用户离开不可取消的后台设置流程；`onboardingWizard.test.tsx` 用 pending download promise 覆盖 busy 时 skip 不可点击。
- 改进 [OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:50)：推荐模型 catalog 读取失败时显示非阻断 `role="status"`，说明模型详情不可用但 setup 仍可按推荐 id 继续；`onboardingWizard.test.tsx` 覆盖 catalog failure fallback。
- 改进 [ModelManager.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/ModelManager.tsx:158)：Advanced catalog 每个模型现在显示 `Tier: Fast/Medium/Quality` 或当前未分配状态，减少高级模型和 tier 之间的认知断层。
- 扩展 [modelManagerInteraction.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/modelManagerInteraction.test.tsx:1)，覆盖 Advanced catalog 的 tier mapping 文案。
- 改进 [HistoryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/HistoryView.tsx:85)：每条历史记录新增 `Paste final text` 动作，复用现有本地 paste bridge，并在 paste/delete 运行时禁用冲突操作。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:413)：新增 `pasteHistorySession`，成功后更新 paste status 和状态横幅，失败时显示可见错误。
- 改进 [SettingsView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/SettingsView.tsx:150)、[ModelManager.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/ModelManager.tsx:83) 和 [app.css](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/styles/app.css:627)：把 Processing toggles、Privacy 权限卡片、推荐模型卡、Advanced catalog、import row 和 status 文案的内联样式迁移为 CSS class；权限状态改用 `permission-status--ready/attention/neutral` 表达。
- 改进 [ModelManager.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/ModelManager.tsx:34) 和 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:610)：高级模型删除改为页面内 `ConfirmInline`，和下载/慢速确认保持一致；App 层移除 `window.confirm`，组件测试直接覆盖取消前不触发、确认后触发删除。
- 改进 [desktopBridge.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/desktopBridge.ts:129) 和 [storage.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/storage.rs:96)：browser fallback 保存历史时先按 id 去重，native SQLite upsert 同步更新 `created_at`；新增 Rust storage 测试覆盖 upsert、倒序 100 条上限、CJK/特殊字符、raw text 和 legacy summary roundtrip。
- 改进 [storage.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/storage.rs:225)：storage tests 使用进程内 `Mutex` 串行化临时数据库环境变量切换，避免全量 Rust 测试并行时互相污染 `DICTIVO_DB_PATH`。
- 改进 [billing.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/billing.ts:1) 和 [privacy.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/privacy.test.ts:1)：billing checkout 与 Stripe webhook 也复用 metadata-only privacy guard，误传 transcript/dictionary 等字段时返回 `content_fields_not_allowed`。
- 改进 [packages/shared/src/index.ts](/Users/mayijie/Projects/Code/033_Dictivo/packages/shared/src/index.ts:128) 和 [privacy.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/privacy.test.ts:1)：forbidden content field 列表扩展到 `content`、`rawText`、`finalText`、`transcriptionText`、`promptTerms`、`snippetReplacement` 等常见别名，并把字段匹配改为大小写/标点格式无关；API 测试确认 `content`、`transcript_text`、`prompt_terms` 这类别名会在 route schema strip 之前被拒绝。
- 改进 [transcription.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/transcription.ts:7)、[usage.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/usage.ts:6) 和 [billing.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/billing.ts:9)：metadata/checkout request schemas 改为 `.strict()`，未知字段返回对应 invalid metadata error；`metadata.test.ts` 覆盖 transcription、usage 和 checkout 的 unknown-field 拒绝。
- 改进 [index.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/index.ts:10)：非 test 环境保留 logger redaction，test 环境关闭 Fastify logger；rate-limit 注册后再通过 route plugin 注册业务 routes，确保 global onRoute hook 覆盖所有 API。
- 新增 [security.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/security.test.ts:1)：覆盖 configured-origin CORS preflight、64 KB body limit 413、连续请求触发 429 rate limit。
- 改进 [index.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/index.ts:23) 和 [billing.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/src/routes/billing.ts:1)：API JSON parser 现在保存 raw body；配置 `STRIPE_WEBHOOK_SECRET` 时 webhook 必须通过 `stripe-signature` HMAC 校验，缺失、错误或过期签名返回 `invalid_stripe_signature`。
- 改进 [SettingsView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/SettingsView.tsx:163)：hotkey recorder 会用平台归一化匹配检查另一个已配置 shortcut，重复时显示 `This shortcut is already assigned.`，避免 Paste Last 被 Dictation 抢占。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:292)：`startDictation()` 现在先同步检查并设置 `isDictatingRef`，录音启动失败或 stop 时同步复位，避免 Hold 模式重复 keydown 在 React state 更新前重复启动录音。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:120)：新增 recording setup pending / stop-after-setup refs；如果 Stop 发生在 microphone controller 创建前，App 会排队停止请求，在 controller resolve 后立即 stop/transcribe，不再留下后台录音或错误显示 `No active recording was found.`。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：覆盖 Hold 模式重复 Pressed 事件只启动一次 recording，Released 后只 stop/transcribe 一次。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：覆盖 Paste Last 热键成功路径，确认它从最新 history session 取 `final transcript` 并调用 `pasteText()`，同时显示用户可见成功横幅；失败路径仍显示可读错误。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:292)：录音启动失败时恢复启动前 editor 文本，避免麦克风拒绝/设备错误后残留 `Recording locally...` 假状态；App 测试覆盖失败后不调用 local transcription 或 history save。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：覆盖 clipboard race 的 App 级路径，断言 stop 后使用录音前 clipboard marker 调用 `pasteText()`，`clipboard-changed-copied` 时 transcript 保持可见、history 正常保存、状态提示用户自动粘贴已跳过。
- 改进 [settingsStore.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/settingsStore.ts:1)：fresh v4 和 legacy settings 都走统一 normalization，非法 language/mode/tier/avatar/hotkey/toggle 回退到默认值，合法的单个 false processing toggle 会保留。
- 改进 [settingsStore.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/settingsStore.ts:1)：dictionary/snippets 现在逐条校验结构，过滤空值/畸形项，兼容旧 string[] dictionary，补 legacy id/createdAt/language，并按 term/trigger 去重。
- 改进 [SettingsView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/SettingsView.tsx:320) 和 [settingsStore.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/settingsStore.ts:56)：全局快捷键现在要求 Command/Control/Alt 这类主 modifier，Shift-only 被拒绝；加载旧 settings 时也会清理不安全或重复快捷键。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：覆盖从 Settings -> Hotkeys 修改 Dictation shortcut 和 activation mode 后，回到 Dictation Workbench 时 quick tips、capture hint 和 `Hold and speak` 文案立即使用新设置。
- 扩展 [onboardingWizard.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/onboardingWizard.test.tsx:1)：补齐硬件扫描失败覆盖，确认错误以 alert 展示、Continue 禁用、Skip setup 仍可退出。
- 改进 [desktopBridge.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/desktopBridge.ts:1)、[lib.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/lib.rs:1)、[HistoryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/HistoryView.tsx:1) 和 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:1)：History copy raw/final 改为 App 统一处理，桌面版使用原生 `copy_text` 只复制不自动粘贴；web preview 在 Clipboard API 被拒绝时使用 selection fallback，最终失败时显示用户可理解的文案。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：覆盖 App 级 History 单条删除、clear-all 确认、copy raw、copy final 和 paste final 路径，断言 `deleteLocalSession` / `clearLocalSessions` / `copyText` / `pasteText` 被调用、`listLocalSessions` 刷新后的结果进入 UI、成功状态可见。
- 扩展 [app.spec.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/e2e/app.spec.ts:72)：History E2E 现在点击 `Export markdown`，断言下载文件名为 session id `.md`，并读取下载内容确认包含标题和 final transcript。
- 改进 [export.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/export.ts:21) 和 [HistoryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/HistoryView.tsx:114)：Markdown export 文件名改用 `markdownFilenameForSession()`，显式清理异常字符、空 id、过长 id 和 Windows 保留名；`export.test.ts` 覆盖正常、legacy/corrupted、空值、保留名和长度上限。
- 改进 [desktopBridge.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/desktopBridge.ts:272)：browser preview 的 History fallback 现在会从损坏 JSON、非数组 payload、畸形 session 记录和不支持的 language/mode/provider/privacyMode 枚举中恢复；坏数据会被清理或过滤，避免用户历史页被本地坏缓存卡住。
- 改进 [HistoryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/HistoryView.tsx:84)：History 空状态拆成 `No local dictations yet.` 和 `No local dictations match this search.`，避免首次使用或清空历史后误导用户。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:137)：启动时 local history 加载失败和 native 状态刷新失败都会进入 `status-banner`，不再产生静默失败或未处理 promise rejection；新增 App 级启动恢复测试。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:178)：tier 切换会在模型激活失败时回滚到之前的 tier；下载并 benchmark 后使用最新 `RunnableTiers` 继续选择模型，避免旧 mapping 参与后续激活。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:198)：下载并 benchmark Fast/Quality 这类非 Medium tier 后，只更新该 tier 的真实 RTF/downloaded/predicted 状态并写回 runnable tier cache；只有 Medium tier 会调用 `finalizeCalibration` 重算完整 baseline。
- 改进 [HistoryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/HistoryView.tsx:106)：copy/paste/delete/clear 任一历史操作运行时，删除按钮也会进入统一锁定，避免并发修改本地历史。
- 改进 [ModelManager.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/ModelManager.tsx:55)：模型 operation 运行时锁定 tier cards、re-run setup、catalog actions 和 import row，避免并发模型文件操作。
- 改进 [OnboardingWizard.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/OnboardingWizard.tsx:54)：校准失败会返回推荐模型 step，显示 alert 和 `Try setup again`，不再卡在无操作的 calibration 页面。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:369)：paste-last 热键路径现在捕获 `pasteText()` 失败并显示状态横幅，避免剪贴板失败时静默丢失用户动作。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:170)：旧 settings cleanup 现在包在非关键 try/catch 内，storage cleanup 被阻止时仍能继续启动并由 `saveSettings` 自身处理持久化失败。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:279)：转写成功后先保留最终文本；paste/copy 失败和 history 保存失败现在作为部分失败显示在状态横幅中，不再把已生成 transcript 当作整次听写失败。
- 改进 [.github/workflows/build-desktop.yml](/Users/mayijie/Projects/Code/033_Dictivo/.github/workflows/build-desktop.yml:63)：desktop release workflow 现在显式执行 `npm run lint`、`npm run test`、`npm audit --audit-level=moderate`、`cargo fmt --check`、普通 Rust 单测、Playwright Chromium 安装、`npm run e2e` 和 `git diff --check`，再进入 Private Fast engine 准备与 Tauri 打包；交互式 `global_hotkey_probe` 改为 `workflow_dispatch` 手动 opt-in，避免 push/tag CI 被真实桌面热键探针非确定性阻塞。
- 改进 [private_fast.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/private_fast.rs:1770)：`benchmark_tier` 现在校验 model id，在 Dictivo private-fast work 目录写临时输出文件并清理，不再使用 `/dev/null` 作为 whisper.cpp output stem；新增 Rust 单测覆盖不支持的 path-like model id 被拒绝。
- 新增 [smoke-private-fast.mjs](/Users/mayijie/Projects/Code/033_Dictivo/scripts/smoke-private-fast.mjs:1) 和 root `smoke:private-fast` script：发布前可重复验证安装包内置 `whisper-cli`、本地 Private Fast 模型和 benchmark 音频的真实转写链路；脚本现在可被测试导入，导入时不会启动真实 whisper。
- 新增 [native-manual-test-plan.md](/Users/mayijie/Projects/Code/033_Dictivo/docs/native-manual-test-plan.md:1)：把真实麦克风、OS 权限、跨应用 hotkey、剪贴板 race、companion 原生窗口、tray、模型操作、Windows 安装/热键和隐私网络 spot check 写成可执行 release checklist。
- 新增 [fixtures.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/e2e/fixtures.ts:1)：所有 Playwright E2E 统一监听 browser `pageerror`、`console.error`、非本地 network request 和非本地 WebSocket，任何隐藏运行时错误或外部请求都会让测试失败；5 个 E2E spec 改为使用该共享 fixture。
- 改进 [private_fast.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/private_fast.rs:576)：Private Fast 转写失败不再把 whisper.cpp stdout/stderr 原样返回给 UI，改为不含用户内容的可操作错误；whisper.cpp 进程启动失败时会清理已写入的临时 WAV 和输出文件；Rust 单测覆盖失败文案不回显 stdout/stderr 以及转写临时文件清理。
- 改进 [desktopBridge.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/desktopBridge.ts:520)：whisper prompt terms 只包含 dictionary term 和 snippet trigger，不再包含 snippet replacement；replacement 仍只在本地 polish 阶段应用。`desktopBridge.test.ts` 覆盖 native invoke 参数不再包含 URL replacement。
- 改进 [mediaCapture.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/mediaCapture.ts:93) 并扩展 [mediaCapture.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/mediaCapture.test.ts:1)：WAV encoder 和 WAV recording controller 现在都有自动化覆盖，断言 local whisper.cpp 需要的 RIFF/WAVE、16 kHz、mono、16-bit PCM、重采样和空录音输出；停止录音时即使 `AudioContext.close()` 失败也会释放 microphone tracks。
- 改进 [mediaCapture.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/mediaCapture.ts:58)：compressed recorder error 现在先清理 microphone tracks 再向上抛出 `Recording failed`；`mediaCapture.test.ts` 补充 start/stop、permission denial 和 recorder error cleanup 覆盖。
- 改进 [mediaCapture.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/mediaCapture.ts:70)：WAV recorder 初始化失败时会关闭已创建的 `AudioContext` 并释放 microphone tracks；`mediaCapture.test.ts` 覆盖 audio source node 创建失败后的 cleanup。
- 扩展 [desktopBridge.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/desktopBridge.test.ts:1)：补齐 Tauri runtime 下硬件 profile、GPU、runnable tiers、benchmark/calibration、模型 select/download/import/delete 的 exact native command 参数断言，以及非 Tauri calibration preview fallback 和 `transcribePrivateFast()` 的 WAV 类型拦截、audio base64 编码、language/mode/source/profile 参数、dictionary/snippet-trigger prompt terms 传递断言。
- 扩展 [smoke-private-fast.mjs](/Users/mayijie/Projects/Code/033_Dictivo/scripts/smoke-private-fast.mjs:1)：macOS 安装版 smoke 现在先读取 `/Applications/Dictivo.app/Contents/Info.plist`，确认 `CFBundleShortVersionString` / `CFBundleVersion` 等于当前 root package 版本，并确认 `NSMicrophoneUsageDescription` 与 `NSAppleEventsUsageDescription` 存在且文案可操作。
- 扩展 [releaseWorkflow.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/releaseWorkflow.test.ts:1)：覆盖 smoke 脚本的 transcript phrase 断言、`/dev/null.txt` / `failed to open` 输出错误拦截、安装包 plist metadata 校验，以及 smoke 模型目录扫描优先级。
- 改进 [lib.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/lib.rs:326)：tray menu id 和 tray left-click 处理抽成可测纯逻辑；Rust tests 覆盖 Show Dictivo、Hide Companion、Quit Dictivo、status no-op，以及 left-click-release 只触发 show-main。
- 改进 [lib.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/lib.rs:20)：通用 Tauri 层新增 `quiet_command()`，Windows 下对系统设置入口和 paste automation 的 `cmd` / `powershell` 调用设置 `CREATE_NO_WINDOW`，和 Private Fast 子进程策略保持一致。
- 新增 [releaseWorkflow.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/releaseWorkflow.test.ts:1)：静态锁定 `.github/workflows/build-desktop.yml` 的 macOS universal app target、Windows x64 MSI + NSIS target、artifact path、Lint/Typecheck/Test/Rust/E2E/Prepare Private Fast/Build/Upload 的发布 gate 顺序，以及 Private Fast prepare script 的 stale artifact cleanup contract。
- 改进 [prepare-private-fast-engine.mjs](/Users/mayijie/Projects/Code/033_Dictivo/scripts/prepare-private-fast-engine.mjs:19)：准备平台 bundle 前会清理生成目录里的旧 `manifest.json`、`whisper-cli`、`whisper-cli.exe` 和 `*.dll`，避免跨平台重复构建时把旧 artifact 带入新包。
- 新增 [companionWindowPosition.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/companionWindowPosition.ts:1)，并让 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:986) 复用该纯函数定位 companion；`companion.test.ts` 覆盖普通屏幕、副屏负坐标、小 work area 和自定义 margin。
- 新增 [companionWindow.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/companionWindow.test.tsx:1)：mock Tauri event/window API，直接覆盖浮窗默认 idle、`companion-state` 更新、recording timer、processing/complete/blocked visual state、drag start、hide request 和 dog/cat/Trump/bikini/muscle avatar 渲染。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：mock Tauri `Window.getByLabel("companion")`、`primaryMonitor()` 和 event API，覆盖点击侧边栏 mascot 后原生 companion window 被定位到可见 work area、show 并收到 enabled snapshot；同时覆盖 companion window unavailable 状态，以及 `companion-hide-requested` 事件让主窗口关闭 companion 设置、显示状态并调用原生 hide。
- 改进 [package.json](/Users/mayijie/Projects/Code/033_Dictivo/package.json:13)、[apps/desktop/package.json](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/package.json:30)、[apps/desktop/tsconfig.json](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tsconfig.json:8)、[apps/desktop/vite.config.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/vite.config.ts:10)、[apps/api/package.json](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/package.json:8)、[apps/api/tsconfig.check.json](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/tsconfig.check.json:1) 和 [apps/api/vitest.config.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/api/vitest.config.ts:1)：只有产物 build 会构建 `@dictivo/shared`，API/desktop 的 typecheck/lint/test/test:coverage 直接解析 shared 源码，干净环境或并发 shared rebuild 下不再依赖旧 dist。
- 新增 [localDictationEngine.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/localDictationEngine.test.ts:1)：直接覆盖本地听写引擎的 requested profile、Quality/Balanced -> Fast fallback、Fast failure surfacing 和 slow warning。
- 移除 [Cargo.toml](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/Cargo.toml:25) 的 `tauri-plugin-opener` 依赖、[lib.rs](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/src/lib.rs:277) 的 opener plugin 注册，以及 [default.json](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src-tauri/capabilities/default.json:12) 的 `opener:default` capability；`hotkeys.test.ts` 增加未使用 opener 防回归断言，`version.test.ts` 现在精确锁定完整 Tauri capability allowlist。
- 扩展 [releaseWorkflow.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/releaseWorkflow.test.ts:1)：锁定 GitHub Actions workflow token 权限为 `contents: read`，并防止 `contents: write`、`packages: write` 或 `id-token: write` 进入桌面发布 workflow。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:781)、[HistoryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/HistoryView.tsx:49)、[DictionaryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/DictionaryView.tsx:36) 和 [ModelManager.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/ModelManager.tsx:219)：为顶栏语言选择、History 搜索、Dictionary/Snippet 输入、Dictionary/Snippet 删除、模型导入 select/path 补齐稳定可访问名称；交互测试改用 label/role 查询，防止回归到 placeholder-only、空 label 或泛化删除按钮。
- 改进 [app.css](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/styles/app.css:66) 和 [app.spec.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/e2e/app.spec.ts:155)：为 button/input/select/textarea 统一 `:focus-visible` outline，并新增 Playwright 键盘巡航测试，覆盖主导航、听写按钮、历史操作、Dictionary/Snippet 表单、Settings tabs、tier cards 和 inline confirmation 的可见焦点。
- 改进 [IconButton.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/IconButton.tsx:8) 和 [DictionaryView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/DictionaryView.tsx:68)：共享 icon button 和 Dictionary/Snippet 普通按钮显式使用 `type="button"`，并用 `rg --pcre2 -U '<button(?![^>]*type=)[\\s\\S]*?>' apps/desktop/src -g '*.tsx'` 验证源码里没有遗漏。
- 改进 [ModelManager.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/ModelManager.tsx:60)：模型导入路径为空或只有空格时禁用 `Import`，提交前 trim 首尾空格，避免可在 UI 层修正的路径错误进入原生 import 命令；`modelManagerInteraction.test.tsx` 覆盖空路径禁用和填写带空格路径后的 trimmed import 调用。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:1)：覆盖 Settings -> Local Engine -> Advanced 的 App 级 delete/import 状态流，断言 `deletePrivateFastModel` / `importPrivateFastModel` 被调用、import path 被 trim、成功状态可见。
- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:199)：启动加载 runnable tier cache 失败时显示用户可读状态，不再静默吞掉；`appStartup.test.tsx` 覆盖 `Tier cache unreadable` 回归场景。

本轮验证：

- `npm run lint`：通过；shared/API/desktop 三个 workspace 都执行 `tsc --noEmit`。
- `npm run build`：通过；shared、API、desktop build 全部成功。
- `npm run typecheck`：通过；shared/API/desktop 均执行源码级 TypeScript 检查，API/desktop 不依赖 `packages/shared/dist`。
- `npm run test`：通过；shared 5、desktop 172、API 16 个 Vitest tests 全部通过。
- `npm run e2e`：通过；9 个 Chromium desktop Playwright 用例全部通过，输出无 `NO_COLOR`/`FORCE_COLOR` warning。
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`：通过；40 个 Rust 单测通过，`global_hotkey_probe` 1 个交互式 probe 按设计 ignored。
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml permission_settings -- --nocapture`：通过；覆盖当前平台权限入口和 macOS / Windows / Linux 三套 release platform 权限设置命令映射。
- `/Applications/Dictivo.app/Contents/Resources/private-fast/bin/whisper-cli -m ~/Library/Application\ Support/Dictivo/private-fast/models/ggml-small.bin -f .private-fast-build/whisper.cpp/samples/jfk.wav -l en -otxt -of /tmp/dictivo-jfk-smoke -np`：通过；安装包内置 universal whisper.cpp binary 能用真实 small 模型转写 JFK 样例音频。
- `whisper-cli` benchmark 参数 smoke：使用 Dictivo private-fast work 目录临时 output stem 通过，输出文本为 `the quick brown fox jumps over the lazy dog. Local dictation works well today.`，不再出现 `/dev/null.txt` 写入错误。
- `npm run smoke:private-fast`：通过；脚本化验证 `/Applications/Dictivo.app` 版本与 root package 版本一致、macOS Microphone/AppleEvents usage descriptions 存在、安装包内置 binary + 本地 small 模型 + benchmark 音频可真实转写，并断言输出包含 `quick brown fox` 和 `local dictation`。
- `npm run test -w @dictivo/desktop -- mediaCapture.test.ts`：通过；desktop tests 增至 142，覆盖 WAV encoder 的 header、16 kHz mono PCM、重采样、空录音输出、WAV start/stop、`AudioContext.close()` 失败后的 track cleanup、compressed start/stop、permission denial 和 recorder error cleanup。
- `npm run test -w @dictivo/desktop -- companion.test.ts`：通过；desktop tests 增至 109，覆盖 companion snapshot 和窗口定位边界。
- `npm run test -w @dictivo/desktop -- localDictationEngine.test.ts`：通过；desktop tests 增至 102，覆盖 profile fallback、Fast failure 和 slow warning。
- `npm run test -w @dictivo/desktop -- hotkeys.test.ts`：通过；desktop tests 增至 110，覆盖 Tauri global shortcut capability 保留，并断言未使用的 opener plugin / capability 不会重新进入打包权限面。
- `npm run test -w @dictivo/desktop -- desktopBridge.test.ts`：通过；desktop tests 增至 112，覆盖安装版合并 browser microphone `granted` 状态，以及 permission API 不可用时保留原生状态。
- `npm run test -w @dictivo/desktop -- privacySettings.test.ts settingsInteraction.test.tsx componentsStatic.test.tsx`：通过；desktop tests 增至 113，覆盖 Privacy 页不会为 `web-preview`、`clipboard-only`、`not-required`、`granted` 显示无效系统设置按钮。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx componentsInteraction.test.tsx modelManagerInteraction.test.tsx componentsStatic.test.tsx`：通过；覆盖顶栏语言选择、History 搜索、Dictionary/Snippet 表单和删除按钮、Local Engine 模型导入控件的可访问名称。
- `rg --pcre2 -U '<button(?![^>]*type=)[\\s\\S]*?>' apps/desktop/src -g '*.tsx'`：通过；确认桌面源码中的 React button 都显式声明了 `type`。
- `rm -rf packages/shared/dist && npm run typecheck -w @dictivo/api`、`npm run lint -w @dictivo/api`、`npm run test -w @dictivo/api`：通过；验证 API 非产物命令直接使用 shared 源码。
- `rm -rf packages/shared/dist && npm run typecheck -w @dictivo/desktop`、`npm run lint -w @dictivo/desktop`、`npm run test -w @dictivo/desktop -- hotkeys.test.ts`：通过；验证 desktop 非产物命令直接使用 shared 源码。
- `rm -rf packages/shared/dist && npm run typecheck`、`npm run test`、`npm run lint`：并发复跑通过；验证 root 级门禁不再因 shared dist 被并发清理而解析失败。
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test global_hotkey_probe -- --ignored --nocapture`：通过；当前 macOS 环境可 reserve 默认全局快捷键。
- `npm audit --audit-level=moderate`：通过，`found 0 vulnerabilities`。
- `git diff --check`：通过，无 whitespace error。
- `npm run tauri:build -w @dictivo/desktop -- --bundles app`：2026-05-13 已用当前源码重新构建成功，产物版本 `0.2.0`。
- `/Applications/Dictivo.app`：已用最新 bundle 覆盖安装，版本 `0.2.0`；启动/退出 smoke 通过；`/Applications`、`~/Applications`、Desktop、Downloads 和 Spotlight bundle-id 复扫只发现这一份可打开的 Dictivo app。
- `npm run test -w @dictivo/desktop -- desktopBridge.test.ts componentsInteraction.test.tsx componentsStatic.test.tsx`：History copy bridge 改动后通过，desktop tests 增至 82，覆盖 copy fallback、clipboard denied fallback 和 History copy handler。
- `npm run e2e -w @dictivo/desktop`：History copy E2E 改动后通过，覆盖 Chromium 预览中点击 Copy final text 后的成功状态横幅。
- `npm run test -w @dictivo/desktop -- desktopBridge.test.ts`：History corrupted storage recovery 改动后通过，desktop tests 增至 83，覆盖坏 JSON 清理、非数组 payload 清理和畸形 session 过滤。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App startup resilience 改动后通过，desktop tests 增至 85，覆盖历史加载失败和 native refresh 失败的用户可见反馈。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：tier activation rollback 改动后通过，desktop tests 增至 86，覆盖 `selectPrivateFastModel` 失败时 UI tier 回滚和错误横幅。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：paste-last hotkey failure 改动后通过，desktop tests 增至 87，覆盖全局 hotkey 触发 paste-last 且 clipboard/paste 失败时的错误横幅。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：legacy settings cleanup 改动后通过，desktop tests 增至 88，覆盖 localStorage cleanup 被阻止时应用仍能启动。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：dictation completion partial-failure 改动后通过，desktop tests 增至 90，覆盖转写成功但 history 保存失败、paste/copy 失败时 transcript 仍留在 UI 并显示部分失败横幅。
- `npm run lint -w @dictivo/api`：Stripe webhook 签名校验改动后通过。
- `npm run test -w @dictivo/api`：Stripe webhook 签名校验改动后通过，API tests 增至 13，覆盖缺失签名、错误签名、过期签名和正确签名。
- `npm run lint -w @dictivo/desktop`：settings sanitization 和 non-Medium tier cache 改动后通过。
- `npm run test -w @dictivo/desktop -- settingsStore.test.ts localPolish.test.ts componentsInteraction.test.tsx`：settings data-shape sanitization 改动后通过，desktop tests 增至 91。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx modelManagerInteraction.test.tsx settingsStore.test.ts`：non-Medium tier benchmark/cache 改动后通过，desktop tests 增至 92。
- `npm run test -w @dictivo/desktop -- componentsInteraction.test.tsx`：History operation lock 改动后通过，desktop tests 增至 93。
- `npm run test -w @dictivo/desktop -- settingsInteraction.test.tsx settingsStore.test.ts hotkeys.test.ts componentsInteraction.test.tsx`：unsafe/duplicate stored hotkey normalization 改动后通过，desktop tests 增至 94。
- `npm run test -w @dictivo/desktop -- onboardingWizard.test.tsx modelManagerInteraction.test.tsx componentsInteraction.test.tsx settingsStore.test.ts`：Onboarding calibration retry 和 model operation lock 改动后通过，desktop tests 增至 95。
- `npm run test -w @dictivo/desktop -- companionWindow.test.tsx companion.test.ts`：浮窗渲染覆盖补强后通过，desktop tests 增至 116，覆盖 Tauri `companion-state` 事件、timer、hide/drag 和 avatar/phase DOM。
- `npm run test:coverage -w @dictivo/desktop`：通过；20 个 desktop test files / 172 tests 全部通过。`CompanionWindow.tsx` statements 覆盖为 94.33%，`desktopBridge.ts` statements 覆盖为 84.91%，App statements 覆盖为 88.31%，HistoryView lines 覆盖为 90%，OnboardingWizard branch 覆盖为 72.72%，ModelManager branch 覆盖为 89.36%，`mediaCapture.ts` lines 覆盖为 100%，`export.ts` lines 覆盖为 100%，整体 desktop coverage 为 statements 90.51%、branches 79.17%、functions 95.18%、lines 95.06%。
- `npm run test -w @dictivo/desktop -- desktopBridge.test.ts`：Private Fast bridge 覆盖补强后通过，desktop tests 增至 121，覆盖硬件/GPU/tier/benchmark/calibration/model operation native invoke 参数、calibration web-preview fallback、非 WAV 阻断和 WAV -> native transcription invoke 参数。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：sidebar mascot -> native companion window 入口覆盖补强后通过，desktop tests 增至 122，覆盖 companion window 获取、定位、show 和 state emit。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：companion hide-request sync 覆盖补强后通过，desktop tests 增至 123，覆盖 companion window hide request 回写主窗口状态和原生 hide。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：companion unavailable 状态覆盖补强后通过，desktop tests 增至 124，覆盖 Tauri 未返回 companion window 时的用户可见错误和不触发 show/state emit。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App 级 hotkey display sync 覆盖补强后通过，desktop tests 增至 125，覆盖 Settings 修改快捷键和 hold/toggle 后 Dictation quick tips / capture hint 立即同步。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App 级 History delete/clear wiring 覆盖补强后通过，desktop tests 增至 127，覆盖删除/清空调用 bridge、重新读取列表并更新 UI。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App 级 History copy/paste wiring 覆盖补强后通过，desktop tests 增至 128，覆盖 copy raw、copy final、paste final 调用 bridge 并显示成功状态。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App 级 Dictionary/Snippets 状态流覆盖补强后通过，desktop tests 增至 129，覆盖新增/删除 term 与 snippet 后 UI 状态更新。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App 级 Local Engine delete/import wiring 覆盖补强后通过，desktop tests 增至 131，覆盖 Advanced catalog 删除模型、导入模型路径 trim 和成功状态。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App 级 Privacy open-settings/refresh wiring 覆盖补强后通过，desktop tests 增至 132，覆盖权限入口调用和刷新后 UI 状态更新。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App 级 out-of-budget Quality tier 覆盖补强后通过，desktop tests 增至 133，覆盖慢速警告确认后下载、benchmark、写回 Quality tier cache 并激活模型。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App 级 Local Engine refresh/rerun 覆盖补强后通过，desktop tests 增至 135，覆盖 `Refresh status` 更新 native status/model state，以及 `Re-run setup` 清理 benchmark cache、重新 benchmark Medium 并 finalize calibration。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：App 级 Dictation Workbench wiring 覆盖补强后通过，desktop tests 增至 136，覆盖 workbench tier radio 切换、companion preview hide 回写应用状态，以及 `Resume from history` 导航到本地历史。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：Settings-launched setup wizard return path 修复后通过，desktop tests 增至 137，覆盖 `Run setup wizard instead` 后跳过 setup 会回到 Dictation。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx componentsStatic.test.tsx componentsInteraction.test.tsx`：CJK language flow 修复后通过，desktop tests 增至 138，覆盖中文计数显示为 characters、语言传入 local dictation，并以 `zh` metadata 保存历史 session。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx settingsInteraction.test.tsx`：Processing toggle App 级覆盖补强后通过，desktop tests 增至 139，覆盖关闭 Auto polish 后 `localProcessing.autoPolish: false` 传入本地听写。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx settingsStore.test.ts componentsInteraction.test.tsx componentsStatic.test.tsx localPolish.test.ts`：Dictionary/Snippets language scope 修复后通过，desktop tests 增至 140，覆盖 UI 只显示当前语言 term/snippet、local dictation 只接收当前语言 prompt terms，以及 settings migration 跨语言重复项保留。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：runnable tier cache 启动失败反馈补强后通过，desktop tests 增至 143，覆盖 `getRunnableTiers()` 失败时显示用户可见错误。
- `npm run test -w @dictivo/desktop -- componentsStatic.test.tsx componentsInteraction.test.tsx appStartup.test.tsx`：History CJK metadata 修复后通过，desktop tests 增至 144，覆盖中文历史记录显示 `characters` 而不是 `words`。
- `npm run test -w @dictivo/desktop -- componentsStatic.test.tsx appStartup.test.tsx componentsInteraction.test.tsx`：History empty-state 文案修复后通过，desktop tests 保持 144，覆盖空历史和无搜索结果两种不同空状态。
- `npm run test -w @dictivo/desktop -- onboardingWizard.test.tsx`：Onboarding optional GPU probe 修复后通过，desktop tests 增至 145，覆盖 GPU 探测失败不阻断硬件推荐和 Continue。
- `npm run test -w @dictivo/desktop -- onboardingWizard.test.tsx`：Onboarding busy setup skip lock 修复后通过，desktop tests 增至 146，覆盖模型下载/setup promise pending 时 `Skip setup` 禁用。
- `npm run test -w @dictivo/desktop -- onboardingWizard.test.tsx`：Onboarding catalog failure feedback 修复后通过，desktop tests 增至 147，覆盖模型 catalog 读取失败时显示非阻断状态并允许继续下载推荐 id。
- `npm run test -w @dictivo/desktop -- export.test.ts`：History export filename sanitization 补强后通过，desktop tests 增至 150，覆盖正常 session id、legacy/corrupted id、空 id、Windows 保留名和过长 basename。
- `npm run e2e -w @dictivo/desktop -- app.spec.ts --grep "keyboard focus"`：Accessibility focus 修复后通过，覆盖 browser-preview 中从键盘到达主导航、听写控件、History actions、Dictionary/Snippet 表单、Settings tabs、tier cards 和 inline confirmation 时都有可见 outline。
- `npm run e2e`：E2E runtime/privacy fail-fast fixture 接入后通过，9 个 Chromium desktop 用例在监听 `pageerror`、`console.error` 和非本地 network/WebSocket request 的情况下全部通过。
- `npm run e2e -w @dictivo/desktop -- app.spec.ts`：History markdown export E2E 补强后通过，覆盖 UI 下载事件、`session_seeded.md` 文件名和 Markdown 内容。
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml transcription -- --nocapture`：Private Fast transcription failure hygiene 补强后通过，覆盖失败文案不回显 whisper stdout/stderr 和临时输入/输出文件清理。
- `npm run test -w @dictivo/desktop -- desktopBridge.test.ts`：whisper prompt minimization 补强后通过，覆盖 snippet replacement 不再进入 native `promptTerms`。
- `npm run test -w @dictivo/shared && npm run test -w @dictivo/api`：API content-alias privacy guard 补强后通过，API tests 增至 14，覆盖 `content` / `transcript_text` / `prompt_terms` 这类别名在 schema strip 前被拒绝。
- `npm run test -w @dictivo/api`：API strict metadata schema 补强后通过，API tests 增至 16，覆盖 transcription、usage 和 checkout 未知字段不再被 silent strip。
- `npm run test -w @dictivo/desktop -- mediaCapture.test.ts`：WAV setup cleanup 补强后通过，desktop tests 增至 151，覆盖 audio node 初始化失败时关闭 `AudioContext` 并释放 microphone tracks。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：Paste Last 成功路径补强后通过，desktop tests 增至 152，覆盖热键从最新 history session 取 final transcript 并调用 `pasteText()`，成功后显示用户可见状态。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：Hold hotkey repeat 补强后通过，desktop tests 增至 153，覆盖重复 Pressed 事件不会重复启动 recording，Released 后只 stop/transcribe 一次。
- `npm run test -w @dictivo/desktop -- tests/appStartup.test.tsx`：recording setup race 补强后通过，desktop tests 增至 172，覆盖用户在 microphone setup promise resolve 前点击 Stop 时，App 会显示正在停止、controller resolve 后调用 `stop()` 并继续本地转写，不再出现 `No active recording was found.`。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：Microphone denial / clipboard race 补强后通过，desktop tests 增至 155，覆盖录音启动失败恢复 editor、不保存空历史，以及 clipboard marker race 时保留 transcript、保存 history、提示跳过自动粘贴。
- `npm run test -w @dictivo/desktop -- releaseWorkflow.test.ts`：release workflow / Private Fast prepare hygiene / smoke script / Windows quiet child-process contract / Node 24 Actions hygiene 补强后通过，desktop tests 增至 171，覆盖 macOS universal app matrix、Windows x64 MSI + NSIS matrix、发布 gate 顺序、dependency audit、Rust format check、whitespace check、当前 Node 24-compatible GitHub Actions、`windows-2025-vs2026` runner label、交互式 global hotkey probe 只能手动 opt-in、生成目录中 stale manifest / macOS binary / Windows binary / DLL 的清理约束、smoke transcript / metadata / model-scan 纯逻辑，以及 paste/settings/Private Fast 子进程都继续通过 `CREATE_NO_WINDOW` helper 运行；临时目录行为测试证明清理会删除生成 artifact 且保留 README、benchmark WAV 和普通 notes 文件。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx companionWindow.test.tsx`：native event lifecycle 补强后通过，desktop tests 增至 175，覆盖 `App` 的 `companion-hide-requested` listener 和 `CompanionWindow` 的 `companion-state` listener 在组件先 unmount、Tauri `listen()` 后 resolve 时仍会立即执行 cleanup，不再泄漏 event listener。
- `npm run test -w @dictivo/desktop -- onboardingWizard.test.tsx`：Onboarding setup lifecycle 补强后通过，desktop tests 增至 176，覆盖模型下载 promise pending 时 wizard unmount，下载结束后不会继续触发 benchmark/finalize 或更新卸载后的 setup 状态。
- `npm run test -w @dictivo/desktop -- version.test.ts`：Tauri native config contract 补强后通过，desktop tests 增至 158，覆盖 app identity、打包资源、主窗口尺寸、capability window scope，以及 companion 原生窗口 transparent / borderless / always-on-top / hidden-start / no-taskbar / no-focus / no-shadow 配置。
- `npm run test -w @dictivo/desktop -- version.test.ts`：Private Fast resource contract 补强后通过，覆盖 manifest 语义、CLI binary 存在且非空、benchmark WAV 为 RIFF/WAVE 16 kHz mono 16-bit PCM 且包含 data chunk。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：Privacy / Local Engine failure-feedback 覆盖补强后通过，desktop tests 增至 160，覆盖系统设置入口失败时用户可见错误、模型导入失败时错误横幅和 operation lock 释放。
- `npm run test -w @dictivo/desktop -- desktopBridge.test.ts`：clipboard marker bridge 覆盖补强后通过，desktop tests 增至 161，覆盖 Tauri `clipboard_marker`、`paste_text` 带 expected marker、`copy_text` 的精确 invoke 参数。

## 10. 2026-05-13 后续 CI 与 Hotkey 生命周期审计

本轮新增发现：

- Medium - 已修复：全局 hotkey `register()` 是异步 native 调用。旧实现会在 React effect cleanup 时调用一次 `unregister(shortcuts)`，但如果旧的 `register()` 在 cleanup 之后才 resolve，旧快捷键仍可能被 native 层注册并残留。该场景会影响用户快速修改快捷键、窗口卸载或 React effect 重跑时的跨应用快捷键可靠性。
- Medium - 已修复：如果 native hotkey `register()` 成功返回后 `isRegistered()` 发现部分快捷键不可用，或 `register()` 本身 reject，旧实现只显示错误但没有主动 unregister 已经部分注册的 shortcuts。用户修改快捷键或遇到系统占用快捷键时，可能留下不可见的旧快捷键监听。
- Low - 已修复：快捷键 chip 的展示把 `CommandOrControl` 固定渲染为 macOS 的 `⌘`。在 Windows 版本中实际触发键是 Ctrl，但用户会看到 `⌘⇧Space` 这类 macOS 符号，特别是在公司 Windows 电脑上会造成操作误导。
- Low - 已加防回归：此前按钮语义 gap 已通过人工核对修复，但缺少自动门禁。新增静态 TSX 语义测试，要求所有原生 `<button>` 显式声明 `type=`，防止未来把默认 submit 行为重新带进设置页、历史页或 inline confirmation。

修复与证据：

- 改进 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:583)：抽出 `cleanupShortcuts()`，并在 `register()` resolve 后发现 effect 已 disposed 时再次调用 `unregister(shortcuts)`；如果 disposed 发生在 `isRegistered()` 检查期间、availability check 发现部分快捷键不可用，或 `register()` reject，也会 cleanup。
- 改进 [hotkeys.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/hotkeys.ts:36)、[DictationWorkbench.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/DictationWorkbench.tsx:63)、[App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:630) 和 [CompanionWindow.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/CompanionWindow.tsx:11)：快捷键展示改成 platform-aware；macOS 继续显示 `⌘⇧Space`，Windows/Linux 显示 `Ctrl+Shift+Space`，floating companion 也使用同一展示值。
- 扩展 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:983)：覆盖 App unmount 后 native hotkey registration 才 resolve 的竞态、availability check 部分失败、native registration reject 三条路径，断言 cleanup 时会 unregister，且用户看到明确错误信息。
- 扩展 [hotkeys.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/hotkeys.test.ts:32) 和 [appStartup.test.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/appStartup.test.tsx:309)：覆盖 macOS compact glyph、Windows/Linux `Ctrl+...` label，以及 Windows hardware profile 下主 workbench 的 Dictation / Paste Last chips 不再显示 macOS `⌘`。
- 新增 [uiSemantics.test.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/tests/uiSemantics.test.ts:1)：用 TypeScript 编译器解析 `src/**/*.tsx`，扫描原生 `<button>` JSX opening tags，断言每个按钮都有显式 `type` 属性。
- `npm run test -w @dictivo/desktop -- hotkeys.test.ts appStartup.test.tsx companionWindow.test.tsx`：通过；desktop Vitest 增至 182 tests。
- `npm run test -w @dictivo/desktop -- uiSemantics.test.ts`：通过；desktop Vitest 增至 183 tests，覆盖按钮 `type` 防回归。
- `npm run test:coverage`：通过；shared 5、desktop 190、API 16 个测试通过。当前 desktop coverage 为 statements 90.09%、branches 78.78%、functions 94.45%、lines 94.70%。
- GitHub Actions `Build desktop apps` run `25797354930` 在提交 `8c1a4c4` 上通过，macOS universal 与 Windows x64 job 均完成并上传 artifact。
- 已下载并核对 `Dictivo-Windows-x64-installers` artifact，包含 `msi/Dictivo_0.2.0_x64_en-US.msi` 和 `nsis/Dictivo_0.2.0_x64-setup.exe`。公司电脑优先使用 NSIS `.exe` current-user installer；MSI 保留给 managed deployment。

剩余无法仅凭当前本机自动化完全关闭的验证项不变：真实麦克风权限、真实 whisper.cpp 模型下载/导入/执行、跨应用全局热键行为、OS 权限弹窗、packaged native 键盘巡航、真实 tray 点击、Windows 安装包与真实 Windows 热键/粘贴行为。

## 11. 2026-05-13 自定义浮窗头像 Feature

新增用户能力：

- 用户可以在 Settings → Companion 上传本地 PNG/JPG/WebP/GIF 卡通头像，上传后自动切换为 `Custom`，主界面 companion preview 和独立 floating companion window 都会使用这张图。
- 头像只保存在本地 settings，不上传到 API；文件限制为 1.5 MB 内，避免把过大的 base64 data URL 写入 localStorage 或发送到 companion window state。
- 用户可以删除自定义头像；如果当前正在使用 custom，会回退到 dog；如果用户已经切到其他内置头像，删除 custom 不会改掉当前选择，E2E 已覆盖这个边界。
- 左侧用于打开 floating companion 的头像按钮也会显示 custom 图片，避免入口图标和实际浮窗头像不一致。
- 上传控件的透明 file input 现在通过 `:focus-within` 显示 2px 焦点轮廓，键盘用户 tab 到上传入口时能看到当前位置。
- 启动时会校验旧 settings：如果 `companionAvatar` 是 `custom` 但图片数据缺失、远程 URL、格式不对或过大，会自动回退到 dog，避免空白浮窗。

实现与证据：

- 改进 [settingsStore.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/lib/settingsStore.ts:8)：新增 `custom` avatar 类型、`customCompanionAvatar` 本地字段、上传文件读取和 settings normalization。
- 改进 [SettingsView.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/SettingsView.tsx:230)、[DictationWorkbench.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/DictationWorkbench.tsx:138)、[CompanionWindow.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/components/CompanionWindow.tsx:75) 和 [App.tsx](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/src/App.tsx:824)：设置页上传/删除、主窗口预览、snapshot、浮窗渲染全链路打通。
- 扩展 `settingsStore.test.ts`、`settingsInteraction.test.tsx`、`componentsStatic.test.tsx`、`companion.test.ts`、`companionWindow.test.tsx`、`appStartup.test.tsx`：覆盖本地保存、非法图片回退、上传回调、主界面预览、sidebar launcher、native `companion-state` payload 和浮窗 custom image 渲染。
- 扩展 [app.spec.ts](/Users/mayijie/Projects/Code/033_Dictivo/apps/desktop/e2e/app.spec.ts:173)：浏览器 E2E 真实上传 custom PNG，断言上传入口有可见键盘焦点、`Custom` 被选中、settings 写入本地、Dictation preview 和 sidebar launcher 使用 data URL，删除 custom 后回退到 dog，并覆盖用户先切到 Cat 再删除 custom 时 Cat 选择不会被覆盖。
- `npm run typecheck -w @dictivo/desktop`：通过。
- `npm run test -w @dictivo/desktop -- appStartup.test.tsx`：通过；desktop Vitest 当前 191 tests。
- `npm run test`：通过；shared 5、desktop 191、API 16 个测试通过。
- `npm run e2e`：通过；11 条 chromium-desktop Playwright 场景通过。
- `npm run test:coverage`：通过；desktop coverage 为 statements 90.51%、branches 78.94%、functions 94.45%、lines 94.77%。
