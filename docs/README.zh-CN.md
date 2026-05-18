# Dictivo

[English](../README.md) | 简体中文 | [日本語](README.ja.md) | [Español](README.es.md)

> ⚠️ 此中文翻译是英文 README 的简版。完整功能说明请以 [English README](../README.md) 为准。社区翻译 PR 欢迎。

Dictivo 是一款本地优先的桌面语音转文字工具。默认 Local 模式使用设备上的 `whisper.cpp` 引擎完成转录；可选 Cloud Fast 模式用于需要更低延迟、并接受上传当前录音到云端转录服务的场景。macOS 是当前公开 dogfood 主路径；Windows 验证构建由 CI 持续产出，功能与 macOS 对齐，公开 Windows 发布只等待签名和人工 QA。

## 为什么选择 Dictivo

| 你需要 | Dictivo 的做法 |
| --- | --- |
| 快速输入 | 用全局快捷键开始、停止，并把转录文本粘贴到当前应用。 |
| 隐私默认安全 | Local keeps audio on this device. Cloud Fast uploads audio to cloud transcription providers for faster results. |
| 输出可直接粘贴的文本 | 默认生成普通 Message；可在 `Settings -> Engine -> Text cleanup` 控制标点、填充词和大小写处理。 |
| 复用常用内容 | 用本地词典和 snippets 处理姓名、产品词、链接和固定表达。 |
| 适配不同电脑 | 根据硬件自动推荐 Fast / Medium / Quality 三档；超 budget 的档位仍可点（带警告确认）。 |

## 快速开始

发布包上线后，请从 GitHub Releases 下载最新版本：

- macOS：`.dmg`
- Windows：CI 验证构建中的 `.exe` / `.msi`，用于功能对齐测试，公开发布前仍需签名和人工 QA

打开 Dictivo 后，进入 `Settings -> Engine`，下载或导入一个本地模型。

从源码运行：

```bash
npm install
npm run tauri:dev -w @dictivo/desktop
```

只预览浏览器前端：

```bash
npm run dev
```

## 第一次转录

1. 打开 `Settings -> Engine`。
2. 下载或导入 `.bin` 模型。
3. 按系统提示授予麦克风和辅助功能权限。
4. 按 `CommandOrControl+Shift+Space` 开始录音。
5. 正常说话。
6. 再按一次同样的快捷键停止。
7. 默认 Local 模式会在本地转录、复制最终文本，并尝试粘贴到当前应用。若切换到 Cloud Fast，会在停止录音后上传本次音频到 Dictivo proxy，再返回转录文本。

如果系统阻止自动粘贴，文本仍会复制到剪贴板。macOS 上按 `Command+V`，Windows 上按 `Ctrl+V`。

## 常见问题

| 问题 | 检查方式 |
| --- | --- |
| 没有录音 | 确认麦克风权限，然后重启 Dictivo。 |
| 看不到本地模型 | 在 `Settings -> Engine` 下载或导入 `.bin` 模型。 |
| 已复制但无法粘贴 | macOS 上确认辅助功能权限；Windows 上确认目标输入框已聚焦。随后按 `Command+V` 或 `Ctrl+V`。 |
| 全局快捷键无反应 | 如果快捷键被其他应用占用，请到 `Settings -> Hotkeys` 修改。 |
| 第一次转录很慢 | 先用小模型完成设置验证，再切换到质量更高的模型。 |

## 本地引擎

桌面发布包会包含预期的 Private Fast 引擎布局。从源码运行时，可以先用小模型验证权限、快捷键和延迟：

```bash
DICTIVO_MODEL=small scripts/setup-private-fast.sh
```

质量优先的本地配置：

```bash
DICTIVO_MODEL=large-v3-turbo-q5_0 scripts/setup-private-fast.sh
```

可选覆盖项：

```bash
DICTIVO_PRIVATE_FAST_HOME=/path/to/private-fast
DICTIVO_WHISPER_CLI=/path/to/whisper-cli
DICTIVO_WHISPER_MODEL=/path/to/model.bin
```

## 隐私模型

Dictivo 默认本地优先。Local 模式不会为了听写调用云端 AI API。

Cloud Fast 是单独的可选模式。用户只会看到 `Local` 和 `Cloud Fast` 两个选项；不会看到任何 provider 选择。Cloud Fast 会把当前录音上传到 Dictivo-owned backend/proxy，由 backend 做订阅校验、月度分钟数计量、主路由和 backup route。

Local 模式下，后端不应接收或保存：

- 音频文件或音频 URL
- 转录文本
- 会议总结
- 词典条目
- snippets
- provider 凭证
- API keys

元数据接口只接受本地 session ID、provider 名称、隐私模式、时长和字数等非内容数据。Cloud Fast 转录接口是唯一允许音频上传的路径；词典和 snippets 仍保留在桌面端，并在云端返回 transcript 后本地 polish。

## 语言行为

当前应用默认自动检测输入语言，输出保持为用户实际说的语言；不再要求用户提前选择 “Speaking in”。历史记录和字数/字符数显示会根据检测结果保存。主要覆盖：

- English
- 中文
- Español
- 日本語
- Français
- Deutsch
- Tiếng Việt

GitHub 文档当前提供 English、简体中文、日本語、Español。欢迎贡献更多翻译。

## 快捷键

| 快捷键 | 操作 |
| --- | --- |
| `CommandOrControl+Shift+Space` | 开始或停止听写 |
| `CommandOrControl+Shift+V` | 粘贴上一条转录 |

可以在 `Settings -> Hotkeys` 中修改快捷键。

## 开发命令

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run e2e
npm run test:coverage
npm run build
```

原生桌面命令：

```bash
npm run tauri:dev -w @dictivo/desktop
npm run tauri:build -w @dictivo/desktop
```

## 路线图

- 发布已签名的 macOS 安装包。
- 为 README 增加产品截图和短演示视频。
- 扩展麦克风权限、全局快捷键和本地模型执行的原生 E2E 覆盖。
- macOS 发布稳定后推进 Windows 安装包。
- 增加更多社区翻译。

## 社区

- 问题和安装帮助：仓库公开后使用 GitHub Discussions。
- Bug：请在 GitHub Issues 中提供操作系统、应用版本、本地模型和复现步骤。
- 隐私或安全问题：不要公开粘贴敏感日志；请使用仓库配置后的安全联系渠道。
- 翻译：提交 pull request 更新对应的 `docs/README.<locale>.md` 文件。
