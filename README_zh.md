# Mousqueau v0.1

[English](README.md) | 简体中文

一款 Wails v3 桌面应用，用于校正**已有的 SRT 字幕**，并核对对话中的说话人身份。技术栈为 Go + React/TypeScript + Vite + Ant Design v6，基于官方 Wails v3 React 模板创建，锁定在 `v3.0.0`。支持 macOS、Windows 和 Linux。macOS 是主要目标平台，也是唯一经过人工 GUI 测试的平台；Linux 桌面版在 Xvfb 下自动测试，Windows 只在 CI 中编译并跑单元测试。

![Mousqueau 编辑器，含模拟的繁体中文说话人分离结果](docs/editor-preview.png)

## 在 macOS 上开发

需要：Go **1.26+**、Node **24 LTS**、pnpm **12.10.1**（锁定在 `frontend/package.json`）、Xcode Command Line Tools，以及可选的 FFmpeg / yt-dlp。编辑字幕不需要 API 密钥。

如果用 Vite+ 管理环境，它会读取 `frontend/package.json` 中锁定的 pnpm 版本；在 `frontend` 目录下运行 `vp install --frozen-lockfile`。全局安装 Vite+ 不是必需的：Wails 任务和 CI 都直接调用 pnpm。要用 Node/npm 安装锁定版本的 pnpm，运行 `npm install --global pnpm@12.10.1`。

```sh
xcode-select --install
brew install go node ffmpeg
# 可选：从视频页面下载（独立于 Mousqueau 安装）
brew install yt-dlp

go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0
# 确保 $(go env GOPATH)/bin 在 PATH 中。
cd frontend
pnpm install --frozen-lockfile
cd ..
wails3 dev
```

要使用 AI 分析，在 **设置 › 供应商**（⌘, 或 Ctrl+,）中选择一个供应商。除非另有说明，每个供应商都会对上传的范围做说话人分离：

| 供应商 | 模型（第一个为默认） | 凭据 | 环境变量 |
| --- | --- | --- | --- |
| OpenAI | `gpt-4o-transcribe-diarize` | API 密钥 | `OPENAI_API_KEY` |
| Deepgram | `nova-2`、`nova-3` | API 密钥 | `DEEPGRAM_API_KEY` |
| AssemblyAI | 服务默认、`universal-3-5-pro`、`universal-2` | API 密钥 | `ASSEMBLYAI_API_KEY` |
| ElevenLabs | `scribe_v2` | API 密钥 | `ELEVENLABS_API_KEY` |
| 阿里云百炼 | `paraformer-v2`、`fun-asr` | DashScope API 密钥 | `DASHSCOPE_API_KEY` |
| 腾讯云语音识别 | 引擎 `16k_zh`、`16k_zh_video` | SecretId + SecretKey | `TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY` |
| 自定义（OpenAI 兼容） | 任意；只有返回 `diarized_json` 的模型才会区分说话人 | 可选 API 密钥 | 无 |

阿里云的文件转写从 URL 读取音频，因此 Mousqueau 会先把选定范围上传到 DashScope 自己的临时存储，过期后自动删除。AssemblyAI 的转写结果在读取后会从服务端删除。腾讯云请求使用签名（TC3-HMAC-SHA256），SecretKey 本身不会被发送。自定义服务需要 HTTPS 基础地址，例如 `https://api.example.com/v1`，或指向本机的普通 HTTP 地址。添加受中国大陆法律管辖的供应商或自定义端点时，会先提示上传涉及敏感话题的音频的风险，上传确认时会再次提示。

凭据保存在系统凭据存储中（macOS 钥匙串、Windows 凭据管理器，或 Linux 上通过 `secret-tool` 访问的 Secret Service 密钥环），每个供应商一项；OpenAI 那一项沿用原来的名称。也可以在启动前，在 **Go 应用**的环境中设置供应商的环境变量；全部设置齐全时，环境变量优先。凭据只在设置窗口或欢迎窗口中输入一次，然后交给 Go；它不会写入项目或设置文件，也不会再返回给前端。应用不读取 `.env` 文件。通过访达、开始菜单或桌面启动器打开打包好的应用时，通常不会继承终端里导出的变量，这种情况请使用凭据存储。在 Linux 上保存密钥需要 `secret-tool`（Debian/Ubuntu 软件包 `libsecret-tools`）以及正在运行的密钥环，例如 GNOME Keyring 或 KWallet；没有的话请使用环境变量。

```sh
export OPENAI_API_KEY='your-key'
wails3 dev
```

FFmpeg 和 yt-dlp 先在该进程的 `PATH` 中查找，然后（Windows 以外）在 `/opt/homebrew/bin` 和 `/usr/local/bin` 中查找；**设置 › 外部工具** 可以把它们指定到其他位置。首次启动会打开一个简短的欢迎窗口（主题、外部工具、可选的 OpenAI 密钥），之后可以从设置中重新运行。偏好设置保存在用户配置目录下的 `settings.json` 中（macOS 为 `~/Library/Application Support/Mousqueau`，Windows 为 `%AppData%\Mousqueau`，Linux 为 `~/.config/Mousqueau`）。更新检查只读取本仓库在 GitHub 上的发布列表，开启自动检查时每天最多一次，且从不下载任何内容。把鼠标悬停在状态栏左侧的环境指示上，可以查看依赖和配置是否可用。

界面提供简体中文、台湾正体（`zh-TW`）、香港繁体（`zh-HK`）、日语（日本語，`ja-JP`）和美式英语。默认跟随系统的偏好语言（在 macOS 上，系统设置 › 通用 › 语言与地区 › 应用程序中为 Mousqueau 单独设置的语言优先）：香港中文使用香港繁体，译文回退到台湾目录，只在有香港差异时覆盖；其他繁体中文，或台湾、澳门的中文，使用台湾正体；其他中文使用简体译文；日语使用日本語；其余语言使用英语。也可以在 **设置 › 通用 › 语言** 中固定语言。窗口标题、文件对话框、进度和错误信息，以及 macOS 上的菜单栏，都会随之切换。系统语言的更改在下次启动时生效。**设置 › 通用 › 字幕字体** 设置字幕文本的显示字体（字幕列表、预览画面叠加字幕、时间轴、文本框和校正建议）；未安装的字体会回退到界面字体，导出的 SRT 不受影响。其他平台见[在 Windows 或 Linux 上开发](#在-windows-或-linux-上开发)。下文介绍的服务器构建只用于本地测试，不是可部署的服务。

## 在 Windows 或 Linux 上开发

Go、Node 和 pnpm 的版本要求相同，另外同样需要安装 `wails3`。原生工具链见 [Wails 安装指南](https://v3.wails.io/getting-started/installation/)。

- **Windows**：需要 WebView2 运行时（Windows 10/11 已预装）。FFmpeg 和 yt-dlp 可以用 `winget install Gyan.FFmpeg` 和 `winget install yt-dlp.yt-dlp` 安装。
- **Linux**：需要 GTK4 和 WebKitGTK 6 开发包，以及用于媒体播放的 GStreamer 插件。在 Ubuntu 24.04 上：`sudo apt install libgtk-4-dev libwebkitgtk-6.0-dev gstreamer1.0-plugins-good gstreamer1.0-libav ffmpeg libsecret-tools`。yt-dlp 请从其官方发布页或用 `pipx install yt-dlp` 安装，因为发行版的软件包往往跟不上 YouTube 的变化。WebKitGTK 在 bubblewrap 沙箱中运行网页内容；如果系统禁止非特权用户命名空间（GitHub 的 Ubuntu 24.04 runner 就通过 AppArmor 禁止了），应用会在启动时退出，并输出 `bwrap: setting up uid map: Permission denied`。

在这两个平台上，窗口没有原生边框：工具栏就是标题栏（拖动可移动窗口，双击可最大化），最小化、最大化和关闭按钮位于其右侧，而 macOS 的红绿灯在左侧。无边框窗口可以从边缘调整大小。项目标题左侧的三横线按钮打开应用菜单，其中包括设置（也可用 Ctrl+,）和用户词典。所有窗口和弹出层中的滚动条都跟随应用的浅色或深色主题。

### 在 WSL 中构建 Windows 测试版可执行文件

在 WSL 中安装 Go 1.26+ 和锁定版本的 pnpm，然后在仓库根目录运行：

```sh
CGO_ENABLED=0 go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0
export PATH="$(go env GOPATH)/bin:$PATH"
wails3 build GOOS=windows ARCH=amd64 CGO_ENABLED=0
wslpath -w "$PWD/bin/mousqueau.exe"
```

这里使用 Go 的交叉编译；构建 Windows 版不需要 Docker，也不需要 Linux 的 GTK/WebKit 开发包。ARM 版 Windows 请使用 `ARCH=arm64`。构建会嵌入前端，并生成 Windows 图标和 DPI 清单。产物是测试用的可执行文件，不是安装程序。

在 Windows 资源管理器中打开 `wslpath` 输出的路径。Windows 需要 WebView2 运行时；FFmpeg 和 yt-dlp 也必须是 Windows 可执行文件，在设置中配置，或位于 Windows 进程的 `PATH` 中。WSL 里的 Linux 工具不能提供这些依赖。先不配置 API 密钥，从 **加载示例** 开始，然后检查窗口控制按钮、原生 SRT 导入/导出、撤销/重做、项目保存/重新打开，以及本地媒体播放。见[尚未完成的 Windows 验收清单](docs/verification.md#windows-and-linux-acceptance-checklist-still-outstanding)。WSL 构建成功并不代表 Windows 的 GUI 行为已经验证。

## 使用编辑器

1. **导入**（工具栏图标）› **本地文件** › **媒体文件**：选择本地视频或音频文件。MP4/H.264/AAC 是兼容性最好的播放格式。其他格式能否播放取决于 WebView 自带的编解码器。
2. **导入** › **本地文件** › **SRT 字幕**：选择 UTF-8 编码的 SRT 字幕。序号、毫秒级时间戳和多行文本都会保留在项目中。窗口采用视频编辑器式布局：字幕列表（带文本搜索和「待处理／Unknown」筛选）、叠加显示当前字幕的预览画面、检查器，以及包含音频波形、字幕块、说话人和校正建议轨道的时间轴。单击字幕行或字幕块会暂停并跳转；单击标尺或波形会移动播放头。没有未应用的字段编辑时，播放会跟随当前字幕。拖动三栏之间和时间轴上方的分隔条可以调整大小；双击分隔条恢复默认大小。时间轴可以缩小，此时轨道可滚动，但不会超出内容高度。波形由 FFmpeg 在本地解码，需要 FFmpeg 在 `PATH` 中；不会为此上传任何内容。
3. 单击预览画面中的字幕即可编辑文字；这会暂停播放，并打开检查器的 **编辑** 标签页，在那里编辑开始/结束时间（`HH:MM:SS,mmm`）和说话人标注。单击 **应用编辑** 生效。同一标签页还会显示该字幕的词典命中及相关操作。在 **说话人** 标签页中添加 A/B/C 等说话人。未分配说话人的字幕显示为 **Unknown**。一条字幕可以有多个说话人。撤销/重做（工具栏、⌘Z / ⇧⌘Z，或文本框外的 Ctrl+Z / Ctrl+Shift+Z）涵盖编辑、说话人名称、分析结果以及接受/拒绝决定；最多保留最近 100 个撤销快照。
4. 可选：在时间轴标尺上拖动，或用 **调整范围**，选择 **60–300 秒**，然后明确确认 **上传所选音频并分析**。Go 用 FFmpeg 提取单声道 AAC，上传上限为 24 MB，并以 `language=zh` 发送到设置中选定的供应商（OpenAI：`gpt-4o-transcribe-diarize`，配合 `diarized_json` 和 `chunking_strategy=auto`）。说话人编号显示为字母。API 调用和子进程都可以取消。取消会丢弃尚未处理的结果，但无法撤回已经发送的数据，也无法取消供应商的计费。
5. 在 **校正建议** 标签页中，或在 **编辑** 标签页中针对所选字幕，对比原文和转写建议，变化之处会高亮显示。可逐条接受或拒绝。复核标记会指出多个说话人、重叠，以及跨越字幕或范围边界的片段。校正建议**从不会悄悄修改文本或说话人**。手动修改文本后再接受已过时的建议会被拒绝；请重新分析或手动编辑。
6. **保存项目** 写出 JSON，其中包含不可变的原始字幕、可编辑字幕、说话人映射、转写片段、校正建议以及撤销/重做历史。**打开项目** 可将其恢复。项目会保存本地媒体路径；如果文件已移动，请重新导入。项目包含转写内容和本地路径，但不包含 API 密钥。
7. **导出 SRT** 写出编辑后的文本和时间，不含说话人信息。保存和导出都必须使用**新文件名**：会拒绝已存在的目标文件，包括指向源文件的硬链接和符号链接。原始文件永远不会被覆盖。要保留说话人信息和历史记录，请保存 JSON 项目。

使用 **加载示例** 可以在没有 API 密钥的情况下体验一段繁体中文对话和模拟的说话人分离结果。第三条字幕特意包含了重叠的说话人。界面默认跟随系统外观，也可以在设置中固定为浅色或深色。已有的 UTF-8 繁体中文文本会原样保留。台湾普通话音频使用中文转写处理；OpenAI 仍可能返回简体中文或认错人名，接受前请核对用词和字形。说话人分离模型不支持转写提示词，因此 v0.1 不会借提示词假装保证输出繁体中文，也不做风格上的改写。

## 可选：从网络下载

打开 **导入** › **从网络下载**，粘贴单个视频页面的 HTTPS 链接。你安装的 yt-dlp 支持的网站都可以用，包括 YouTube；YouTube 链接会被精简为单个视频。**查找** 会显示标题、网站和时长，并先列出人工字幕，再列出自动字幕。选好要导入的内容后，按一次 **导入**：

- **字幕**：所选字幕轨，由 `yt-dlp` 和 FFmpeg 转换为 SRT。确认后会替换当前的字幕项目。
- **媒体**：**不下载**、**仅音频**（`.m4a`）或 **视频**（`.mp4`；网站提供时为 H.264/AAC，最高 1080p，以便在各平台的 WebView 中播放）。下载媒体需要勾选"我确认有权下载"。你需要选择一个新的文件名；已有文件不会被覆盖，下载完成后它会成为本地媒体源。

对话框会显示当前步骤、百分比和 **取消** 按钮。下载不会上传任何内容。播放列表、频道和批量下载都不支持。能否下载取决于 yt-dlp、网络和视频本身；需要登录或 cookie 的下载不在 v0.1 范围内。当前版本的 yt-dlp 要完整支持 YouTube，可能还需要其文档中说明的 JavaScript 运行时/EJS 依赖。导入本地文件不需要 yt-dlp。

## 测试与构建

```sh
go test ./internal/...
cd frontend
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
cd ..
node --test scripts/frontend-dependencies.test.mjs
# 为当前平台构建 / 打包原生桌面应用
wails3 build
wails3 package
```

Wails 默认用 pnpm 安装依赖和运行前端脚本。更改依赖时请一并提交 `frontend/pnpm-lock.yaml`；日常构建使用冻结的锁文件。这次迁移保留了原有的依赖版本和 Vite/Vitest 配置。

绑定代码已提交到仓库，由 Go 服务的方法签名生成。修改服务方法后请重新生成：

```sh
wails3 generate bindings -ts -i
```

要在没有桌面环境的情况下（例如 CI 或云端容器）驱动原生 Linux 构建，还需安装 `xvfb openbox xdotool x11-utils imagemagick`，先构建前端，然后：

```sh
go build -tags production -o /tmp/mousqueau .
xvfb-run -a -s "-screen 0 1700x1050x24" dbus-run-session -- scripts/linux-gui-smoke.sh /tmp/mousqueau /tmp/mousqueau-shots
```

该脚本会用全新配置打开欢迎窗口，点击绘制出来的关闭按钮将其关闭；分别用按钮和双击标题栏把编辑器最大化再还原；用 Ctrl+, 打开设置并关闭；最后关闭编辑器退出应用，并为每个状态保存一张截图。它只检查 GTK/WebKitGTK 的行为，不涉及 macOS 或 Windows。

在 macOS 上（Xcode 命令行工具提供 `swiftc`），先构建前端，然后：

```sh
go build -tags production -o /tmp/mousqueau .
scripts/macos-launch-smoke.sh /tmp/mousqueau /tmp/mousqueau-shots
```

该脚本用全新配置在浅色和深色系统外观下各启动应用三次；如果应用退出、日志中出现 panic，或 30 秒内没有显示窗口，就判定失败。每次启动都会保持运行超过窗口显示的十秒兜底时间后再结束。运行期间它会切换系统外观，结束后恢复原设置。截图仅供人工查看：脚本不检查颜色，首帧是否白屏仍需在 Mac 上肉眼确认。

要在没有 GTK/WebKit 的 Linux 上做无界面验证，先构建前端，然后：

```sh
CGO_ENABLED=0 wails3 generate bindings -ts -i -f '-tags=server'
CGO_ENABLED=0 go test -tags server ./...
CGO_ENABLED=0 go build -tags server -o /tmp/mousqueau-headless .
WAILS_SERVER_HOST=127.0.0.1 WAILS_SERVER_PORT=9246 /tmp/mousqueau-headless
```

无界面构建使用真实的 Wails 绑定，可以在浏览器中操作编辑器和示例；这种模式下不支持原生文件对话框。请只监听本机回环地址：这是桌面应用，不是带身份验证的远程托管服务。不要声称这能验证 macOS 的 GUI 行为。CI 会检查核心代码、前端和服务器构建，构建原生 macOS 和 Windows 二进制并在两者上运行 Go 测试，还会构建原生 Linux 桌面应用并运行上面的 GUI 冒烟测试；自动构建不能代替在真实的 Mac 或 Windows 电脑上做 GUI 测试。

另见[验证与 Mac 检查清单](docs/verification.md)、[架构](docs/architecture.md)以及[限制 / v0.2](docs/limitations.md)。

## 许可证

Mousqueau 的原创代码采用 **MIT** 许可证。yt-dlp 和 FFmpeg 是由用户自行安装的独立命令行依赖，不随应用分发。yt-dlp 源代码采用 Unlicense，但部分可执行发行版包含 GPLv3+ 代码。见[许可决定](docs/licensing.md)和 `THIRD_PARTY_NOTICES.txt`；分发时请附上这些声明。安装依赖后，用 `node scripts/notices.mjs` 重新生成。
