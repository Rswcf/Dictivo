# Dictivo

[English](../README.md) | 简体中文 | [日本語](README.ja.md) | [Español](README.es.md)

> ⚠️ 此中文翻译是英文 README 的简版。完整功能说明请以 [English README](../README.md) 为准。社区翻译 PR 欢迎。

Dictivo 是一款面向 macOS 和 Windows 的本地优先语音转文字工具。它使用设备上的 `whisper.cpp` 引擎完成转录，适合希望快速听写、保留隐私、管理常用短语，并把结果直接粘贴到当前应用的人。

## 为什么选择 Dictivo

| 你需要 | Dictivo 的做法 |
| --- | --- |
| 快速输入 | 用全局快捷键开始、停止，并把转录文本粘贴到当前应用。 |
| 隐私默认安全 | 音频、转录文本、词典、片段和历史记录保留在本机。 |
| 输出可直接粘贴的文本 | 默认生成普通 Message；可在 `Settings -> Local Engine -> Processing toggles` 控制标点、填充词和大小写处理。 |
| 复用常用内容 | 用本地词典和 snippets 处理姓名、产品词、链接和固定表达。 |
| 适配不同电脑 | 根据硬件自动推荐 Fast / Medium / Quality 三档；超 budget 的档位仍可点（带警告确认）。 |

## 快速开始

发布包上线后，请从 GitHub Releases 下载最新版本：

- macOS：`Dictivo.app` 或 `.dmg`
- Windows：release assets 中的安装包

打开 Dictivo 后，进入 `Settings -> Local Engine`，下载或导入一个本地模型。

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

1. 打开 `Settings -> Local Engine`。
2. 下载或导入 `.bin` 模型。
3. 按系统提示授予麦克风和辅助功能权限。
4. 按 `CommandOrControl+Shift+Space` 开始录音。
5. 正常说话。
6. 再按一次同样的快捷键停止。
7. Dictivo 会在本地转录、复制最终文本，并尝试粘贴到当前应用。

如果系统阻止自动粘贴，文本仍会复制到剪贴板。macOS 上按 `Command+V`，Windows 上按 `Ctrl+V`。

## 常见问题

| 问题 | 检查方式 |
| --- | --- |
| 没有录音 | 确认麦克风权限，然后重启 Dictivo。 |
| 看不到本地模型 | 在 `Settings -> Local Engine` 下载或导入 `.bin` 模型。 |
| 已复制但无法粘贴 | macOS 上确认辅助功能权限，聚焦目标输入框，然后按 `Command+V`。 |
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

Dictivo 默认本地优先。桌面应用不会为了听写调用云端 AI API。

后端不应接收或保存：

- 音频文件或音频 URL
- 转录文本
- 会议总结
- 词典条目
- snippets
- provider 凭证
- API keys

后端只接受元数据，例如本地 session ID、provider 名称、隐私模式、时长和字数。

## 支持语言

当前应用支持这些本地转录设置：

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

- 发布已签名的 macOS 和 Windows 安装包。
- 为 README 增加产品截图和短演示视频。
- 扩展麦克风权限、全局快捷键和本地模型执行的原生 E2E 覆盖。
- 增加更多社区翻译。

## 社区

- 问题和安装帮助：仓库公开后使用 GitHub Discussions。
- Bug：请在 GitHub Issues 中提供操作系统、应用版本、本地模型和复现步骤。
- 隐私或安全问题：不要公开粘贴敏感日志；请使用仓库配置后的安全联系渠道。
- 翻译：提交 pull request 更新对应的 `docs/README.<locale>.md` 文件。
