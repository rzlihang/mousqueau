import { createContext, useContext } from "react";

// Go resolves the language (settings, then the system) and reports it with
// the settings; these dictionaries cover the text the frontend draws.
export type Locale = "zh-CN" | "en-US";
export type LanguageChoice = "system" | Locale;

const zhCN = {
  common: {
    cancel: "取消",
    back: "返回",
    choose: "选择…",
    ready: "已就绪",
    notInstalled: "未安装",
    invalidLocation: "位置无效",
    required: "必需",
    optional: "可选",
    configured: "已配置",
    notConfigured: "未配置",
    offlineOnly: "未配置 · 可离线编辑",
    importMedia: "导入媒体",
    importSrt: "导入 SRT",
    loadDemo: "载入示例",
    system: "系统",
    unknownSpeaker: "Unknown",
    pendingReview: "需人工复核",
    pendingDecision: "待确认",
    emptyProject: "导入 SRT 或载入示例开始编辑",
    seconds: (n: string | number) => `${n} 秒`,
    cues: (n: number) => `${n} 句`,
  },
  theme: {
    label: "主题",
    system: "跟随系统",
    light: "浅色",
    dark: "深色",
  },
  language: {
    label: "语言",
    system: "跟随系统",
    current: (name: string) => `当前：${name}。`,
    hint: "切换后菜单、窗口与提示会一同更新。",
  },
  editor: {
    tagline: "Mousqueau · 字幕校正与说话人辨识",
    untitled: "未命名项目",
    noProject: "未开启项目",
    edited: "已编辑",
    unchanged: "未修改",
    speakerCount: (n: number) => `${n} 位说话人`,
    undo: "撤销",
    redo: "重做",
    withShortcut: (label: string, keys: string) => `${label}（${keys}）`,
    importYoutube: "YouTube 导入",
    openProject: "开启项目",
    saveProject: "保存项目",
    exportSrt: "导出 SRT",
    exportHint:
      "标准 SRT 不包含说话人资料。保存 JSON 项目可保留说话人、建议与编辑历史。导出请选择新文件名。",
    saved: (path: string) => `已保存：${path}`,
    updateAvailable: (version: string) =>
      `有新版本 ${version}，可在 设置 › 更新 中查看。`,
    replaceTitle: "开启另一份字幕／项目？",
    replaceContent: "当前项目将被替换。请先保存需要保留的编辑记录。",
    replaceOk: "替换当前项目",
    unappliedTitle: "尚有未套用的编辑",
    unappliedContent: "先套用当前字幕的文字、时间与说话人修改，再跳到下一句。",
    unappliedOk: "套用并跳转",
    unappliedCancel: "留在当前字幕",
    fixDraftFirst: "请先修正编辑内容",
    endBeforeStart: "结束时间必须晚于开始时间。",
    invalidTime: "请输入 HH:MM:SS,mmm，分与秒须为 00–59。",
    rangeLength: "请选择 60–300 秒的范围。",
    rangeBeyondMedia: "选取范围超过媒体长度。",
    uploadTitle: "将选定范围的音频上传到 OpenAI？",
    uploadContent: (range: string) =>
      `${range}。此操作会将音频发送到外部 API，并可能产生费用。返回结果仅作为待审建议；不会自动修改字幕。`,
    uploadOk: "确认上传并分析",
    waveNoMedia: "导入本机媒体后显示波形",
    waveNeedsFfmpeg: "需要 FFmpeg 才能显示波形",
    waveFailed: "无法生成波形；字幕仍可编辑",
    waveLoading: "正在本机生成波形…",
  },
  cueList: {
    label: "字幕列表",
    title: "字幕",
    todo: (n: number) => ` · ${n} 条待处理`,
    search: "搜索字幕文本",
    filter: "筛选字幕",
    all: "全部",
    todoFilter: "待处理",
    columns: {
      start: "开始",
      duration: "时长",
      speakers: "说话人",
      text: "文本",
      status: "状态",
    },
    noMatch: "没有符合条件的字幕。",
    review: "待复核",
  },
  viewer: {
    label: "检视器",
    mediaError:
      "媒体无法播放。请重新导入，或转为 MP4 / H.264 / AAC；字幕仍可编辑。",
    audioOnly: "仅音频",
    empty: "导入本机视频或音频",
    previous: "上一句",
    play: "播放",
    pause: "暂停",
    next: "下一句",
    speed: "播放速度",
  },
  inspector: {
    label: "检查器",
    edit: "编辑",
    speakers: "说话人",
    suggestions: "校正建议",
    editing: (id: string) => `编辑 #${id}`,
    start: "开始",
    end: "结束",
    stats: (duration: string, rate: string) =>
      `时长 ${duration} 秒 · 字速 ${rate} 字／秒`,
    text: "文本",
    speaker: "说话人",
    unassigned: "Unknown · 未指派说话人",
    needsReview: "需要复核",
    unapplied: "尚未套用",
    nothingUnapplied: "尚无未套用的修改",
    revert: "还原",
    apply: "套用编辑",
    cueSuggestions: "本句校正建议",
    noCueSuggestions: "本句没有校正建议。在时间轴上选取范围后可上传分析。",
    speakersHint: "不同分析范围的标签独立编号，可手动命名与指派。",
    rename: "编辑名称",
    speakerId: "说话人 ID",
    speakerIdPlaceholder: "说话人 ID（A / B / C）",
    displayName: "显示名称",
    displayNamePlaceholder: "显示名称，例如：主持人",
    saveSpeaker: "保存说话人",
    suggestionsHint: "建议不会自动改动字幕。每次接受都需要点击，并可撤销。",
    noSuggestions: "分析音频或载入示例后查看建议",
  },
  range: {
    label: "分析范围",
    perRun: "每次 1–5 分钟",
    start: "开始（秒）",
    end: "结束（秒）",
    fromPlayhead: "以播放头为起点",
    hint: "也可以在时间刻度上拖动选取。请自行确认选取范围与音频内容。",
    adjust: "调整范围",
    analyze: "上传所选音频并分析",
  },
  status: {
    environment: "运行环境",
    optionalMissing: "未安装 · 可选",
    addKeyHint: "在设置中添加 OpenAI API 密钥后即可使用分析。",
    privacy: "文件保留在本机。仅确认分析时上传选定音频。",
    openSettings: (keys: string) => `打开设置（${keys}）`,
    allReady: "环境就绪",
    offline: "可离线编辑",
    noFfmpeg: "FFmpeg 未安装",
    working: "处理中…",
    cancel: "取消处理",
    selected: (id: string) => `已选 #${id}`,
  },
  youtube: {
    title: "可选 YouTube 导入",
    intro: "仅支持单个视频。优先选择手动字幕；字幕下载与音频下载分别由你操作。",
    needsYtdlp: "请先安装 yt-dlp 并加入 PATH。本机媒体与 SRT 导入不受影响。",
    discover: "发现字幕",
    automatic: "自动字幕",
    manual: "手动字幕（优先）",
    noCaptions: "没有可导入的 SRT / VTT 字幕",
    importCaption: "下载并导入所选字幕",
    authorized: "我确认有权下载此视频的音频",
    downloadAudio: "另行下载音频到本机并载入",
    noUpload: "下载不会自动上传到 OpenAI。开始分析仍需另行确认。",
  },
  timeline: {
    label: "时间轴",
    showing: "显示",
    zoom: "缩放",
    zoomLabel: "时间轴缩放",
    audio: "音频",
    cues: "字幕",
    speakers: "说话人",
    suggestions: "校正建议",
    rulerHint: "点击定位播放头；拖动选取分析范围",
    selectCue: (id: string) => `选择第 ${id} 句`,
  },
  suggestion: {
    cue: (id: string) => `字幕 #${id}`,
    accepted: "已接受",
    rejected: "已拒绝",
    original: "分析时原文",
    proposed: "音频转录建议",
    reviewHint: "多人、重叠或跨句／范围边界：请对照音频确认文字与时间。",
    plainHint: "以音频转录为依据，请确认忠实度与繁体用字。",
    acceptReviewed: "确认后接受",
    accept: "接受",
    reject: "拒绝",
    locate: "定位字幕",
  },
  settings: {
    title: "设置",
    nav: "设置目录",
    search: "搜索设置",
    noMatch: (query: string) => `没有与“${query}”匹配的设置。`,
    sections: {
      general: "通用",
      tools: "外部工具",
      providers: "供应商",
      updates: "更新",
    },
    themeFollows: (os: string, current: string) =>
      `随 ${os} 外观自动切换。当前：${current}。`,
    themeFixed: (current: string, os: string) =>
      `始终使用${current}，不随 ${os} 切换。`,
    openLast: "启动时打开上次的项目",
    setup: "初始设置",
    setupHint: "重新检查外部工具与 OpenAI 配置。",
    rerunSetup: "重新运行初始设置",
    toolLocation: (tool: string) => `${tool} 位置`,
    autoFind: "自动查找",
    autoDetect: "自动检测",
    ffmpegHint:
      "用于读取媒体与截取分析音频。留空时在 PATH 与 Homebrew 中查找。",
    ytdlpHint: "仅 YouTube 导入需要。下载不会自动上传到 OpenAI。",
    analysisProvider: "分析使用",
    analysisProviderHint: "音频转录建议与说话人分析都发给这里选的供应商。",
    analysisProviderLabel: "分析使用的供应商",
    inUse: "当前使用",
    keySource: "密钥来源",
    envVar: "环境变量",
    keychain: "macOS 钥匙串",
    replaceKey: "替换 API 密钥",
    apiKey: "API 密钥",
    saveToKeychain: "保存到钥匙串",
    keySaved: "API 密钥已保存到钥匙串。",
    envWins: ["设置了环境变量", "时优先使用它。"] as [string, string],
    noKeychain: ["此平台不支持保存密钥；请设置环境变量", "。"] as [
      string,
      string,
    ],
    removeHint: "移除后仍可离线编辑。",
    removeConfirm: "从钥匙串移除 API 密钥？",
    remove: "移除",
    removeKey: "移除密钥",
    onlyOpenai: "目前仅支持 OpenAI。",
    addProvider: "添加供应商",
    uploadNote: "仅在你确认分析时，选定的音频会上传到所选供应商。",
    currentVersion: "当前版本",
    checking: "正在检查…",
    newVersion: (version: string) => `有新版本 ${version}`,
    openDownload: "前往下载页面",
    upToDate: "已是最新版本",
    justChecked: "刚刚检查",
    neverChecked: "尚未检查",
    lastChecked: (time: string) => `上次检查：${time}`,
    checkNow: "检查更新",
    autoUpdate: "自动检查更新",
    beta: "接收测试版",
    betaHint: "更早获得新功能，可能不稳定。",
    updatesNote:
      "检查更新只连接 GitHub 获取版本信息，不上传字幕或音频，也不会自动下载新版本。",
  },
  welcome: {
    tagline: "字幕校正 · 说话人辨识",
    steps: {
      welcome: "欢迎",
      tools: "外部工具",
      done: "完成",
    },
    title: "开始之前，先做几项设置",
    intro:
      "Mousqueau 对照音频校正现有的 SRT 字幕，并复核说话人。接下来会检查外部工具，并可选配置 OpenAI。",
    facts: [
      "文件保留在本机。",
      "仅在你确认分析时，才上传选定的音频。",
      "未配置 OpenAI 也能离线编辑。",
    ],
    themeFollows: (os: string, current: string) =>
      `跟随 ${os} 的外观。当前：${current}`,
    changeLater: "之后可在设置中更改。",
    toolsTitle: "检查外部工具",
    toolsSearched: "已在 PATH、Homebrew 与 /usr/local/bin 中查找。",
    ffmpegMissing: "读取媒体与分析音频需要。",
    ytdlpMissing: "仅 YouTube 导入需要。",
    notFoundAt: ["在", "找不到可执行文件。"] as [string, string],
    brewInstall: "可用 Homebrew 安装：",
    redetect: "重新检测",
    toolsLater: "之后可在 设置 › 外部工具 中更改位置。",
    openaiTitle: "配置 OpenAI（可选）",
    openaiIntro:
      "用于音频转录建议与说话人分析。仅在你确认分析时，选定的音频会上传到 OpenAI。",
    useEnv: (found: boolean) =>
      `使用环境变量 OPENAI_API_KEY（${found ? "已检测到" : "未检测到"}）`,
    enterKey: "输入 API 密钥",
    keepCurrent: "保持现有配置，不做更改",
    skipKey: "暂不配置，仅离线编辑",
    keyKept: "已保存在钥匙串，留空则保持不变",
    keyStorage: "密钥保存在 macOS 钥匙串，不写入项目文件。",
    envStillWins: "已设置的环境变量仍会优先使用。",
    needKey: "请输入 API 密钥，或选择暂不配置。",
    doneTitle: "设置完成",
    changeAnytime: (keys: string) =>
      `这些设置之后都能在 设置（${keys}）中修改。`,
    skip: "跳过设置",
    previous: "上一步",
    next: "继续",
  },
};

export type Messages = typeof zhCN;

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const enUS: Messages = {
  common: {
    cancel: "Cancel",
    back: "Back",
    choose: "Choose…",
    ready: "Ready",
    notInstalled: "Not installed",
    invalidLocation: "Invalid location",
    required: "Required",
    optional: "Optional",
    configured: "Configured",
    notConfigured: "Not configured",
    offlineOnly: "Not configured · offline editing available",
    importMedia: "Import Media",
    importSrt: "Import SRT",
    loadDemo: "Load Demo",
    system: "system",
    unknownSpeaker: "Unknown",
    pendingReview: "Needs review",
    pendingDecision: "Pending",
    emptyProject: "Import SRT or load the demo to start editing",
    seconds: (n) => `${n} s`,
    cues: (n) => plural(n, "cue", "cues"),
  },
  theme: {
    label: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
  },
  language: {
    label: "Language",
    system: "System",
    current: (name) => `Currently ${name}.`,
    hint: "Menus, windows and messages switch together.",
  },
  editor: {
    tagline: "Mousqueau · Subtitle correction and speaker identification",
    untitled: "Untitled project",
    noProject: "No project open",
    edited: "Edited",
    unchanged: "Unchanged",
    speakerCount: (n) => plural(n, "speaker", "speakers"),
    undo: "Undo",
    redo: "Redo",
    withShortcut: (label, keys) => `${label} (${keys})`,
    importYoutube: "Import from YouTube",
    openProject: "Open Project",
    saveProject: "Save Project",
    exportSrt: "Export SRT",
    exportHint:
      "Standard SRT has no speaker information. Save a JSON project to keep speakers, suggestions and edit history. Exports need a new file name.",
    saved: (path) => `Saved: ${path}`,
    updateAvailable: (version) =>
      `Version ${version} is available. See Settings › Updates.`,
    replaceTitle: "Open other subtitles or another project?",
    replaceContent:
      "The current project will be replaced. Save it first if you want to keep its edit history.",
    replaceOk: "Replace Project",
    unappliedTitle: "Unapplied edits",
    unappliedContent:
      "Apply the text, time and speaker changes to this cue before moving to the next one.",
    unappliedOk: "Apply and Go",
    unappliedCancel: "Stay on This Cue",
    fixDraftFirst: "Fix the edit first",
    endBeforeStart: "The end time must be later than the start time.",
    invalidTime:
      "Enter HH:MM:SS,mmm; minutes and seconds must be between 00 and 59.",
    rangeLength: "Select a range of 60–300 seconds.",
    rangeBeyondMedia: "The selected range extends past the end of the media.",
    uploadTitle: "Upload the selected audio to OpenAI?",
    uploadContent: (range) =>
      `${range}. This sends audio to an external API and may incur charges. Results are only suggestions for review; subtitles are never changed automatically.`,
    uploadOk: "Upload and Analyze",
    waveNoMedia: "The waveform appears after you import local media",
    waveNeedsFfmpeg: "FFmpeg is needed to show the waveform",
    waveFailed: "Could not draw the waveform; subtitles can still be edited",
    waveLoading: "Drawing the waveform locally…",
  },
  cueList: {
    label: "Subtitle list",
    title: "Subtitles",
    todo: (n) => ` · ${n} to do`,
    search: "Search subtitle text",
    filter: "Filter subtitles",
    all: "All",
    todoFilter: "To do",
    columns: {
      start: "Start",
      duration: "Length",
      speakers: "Speakers",
      text: "Text",
      status: "Status",
    },
    noMatch: "No subtitles match.",
    review: "Review",
  },
  viewer: {
    label: "Viewer",
    mediaError:
      "The media cannot be played. Import it again or convert it to MP4 / H.264 / AAC; subtitles can still be edited.",
    audioOnly: "Audio only",
    empty: "Import a local video or audio file",
    previous: "Previous",
    play: "Play",
    pause: "Pause",
    next: "Next",
    speed: "Playback speed",
  },
  inspector: {
    label: "Inspector",
    edit: "Edit",
    speakers: "Speakers",
    suggestions: "Fixes",
    editing: (id) => `Edit #${id}`,
    start: "Start",
    end: "End",
    stats: (duration, rate) => `Length ${duration} s · ${rate} characters/s`,
    text: "Text",
    speaker: "Speakers",
    unassigned: "Unknown · no speaker assigned",
    needsReview: "Needs review",
    unapplied: "Not applied",
    nothingUnapplied: "No unapplied changes",
    revert: "Revert",
    apply: "Apply Edit",
    cueSuggestions: "Suggestions for this cue",
    noCueSuggestions:
      "No suggestions for this cue. Select a range on the timeline to upload it for analysis.",
    speakersHint:
      "Labels from different analysis ranges are numbered separately; name and assign them by hand.",
    rename: "Rename",
    speakerId: "Speaker ID",
    speakerIdPlaceholder: "Speaker ID (A / B / C)",
    displayName: "Display name",
    displayNamePlaceholder: "Display name, e.g. Host",
    saveSpeaker: "Save Speaker",
    suggestionsHint:
      "Suggestions never change subtitles on their own. Each acceptance takes a click and can be undone.",
    noSuggestions: "Analyze audio or load the demo to see suggestions",
  },
  range: {
    label: "Range",
    perRun: "1–5 min per run",
    start: "Start (s)",
    end: "End (s)",
    fromPlayhead: "Start at Playhead",
    hint: "You can also drag on the time ruler. Check the range and its audio yourself.",
    adjust: "Adjust Range",
    analyze: "Upload & Analyze",
  },
  status: {
    environment: "Environment",
    optionalMissing: "Not installed · optional",
    addKeyHint: "Add an OpenAI API key in Settings to enable analysis.",
    privacy:
      "Files stay on this computer. Selected audio is uploaded only when you confirm an analysis.",
    openSettings: (keys) => `Open Settings (${keys})`,
    allReady: "Ready",
    offline: "Offline editing",
    noFfmpeg: "FFmpeg not installed",
    working: "Working…",
    cancel: "Cancel",
    selected: (id) => `Selected #${id}`,
  },
  youtube: {
    title: "Optional YouTube Import",
    intro:
      "One video at a time. Manual subtitles are preferred; subtitles and audio are downloaded by separate actions.",
    needsYtdlp:
      "Install yt-dlp and add it to PATH first. Local media and SRT imports are not affected.",
    discover: "Find Subtitles",
    automatic: "automatic",
    manual: "manual (preferred)",
    noCaptions: "No SRT / VTT subtitles to import",
    importCaption: "Download and Import Selected Subtitles",
    authorized: "I confirm I am authorized to download this video's audio",
    downloadAudio: "Download Audio Separately and Load It",
    noUpload:
      "Downloading never uploads to OpenAI. Analysis still needs its own confirmation.",
  },
  timeline: {
    label: "Timeline",
    showing: "Showing",
    zoom: "Zoom",
    zoomLabel: "Timeline zoom",
    audio: "Audio",
    cues: "Subtitles",
    speakers: "Speakers",
    suggestions: "Suggestions",
    rulerHint: "Click to move the playhead; drag to select the analysis range",
    selectCue: (id) => `Select cue ${id}`,
  },
  suggestion: {
    cue: (id) => `Cue #${id}`,
    accepted: "Accepted",
    rejected: "Rejected",
    original: "Text at analysis",
    proposed: "Transcription suggestion",
    reviewHint:
      "Several speakers, overlap, or a cue/range boundary: check the text and times against the audio.",
    plainHint:
      "Based on the audio transcription; check faithfulness and Traditional Chinese characters.",
    acceptReviewed: "Accept After Checking",
    accept: "Accept",
    reject: "Reject",
    locate: "Show Cue",
  },
  settings: {
    title: "Settings",
    nav: "Settings sections",
    search: "Search settings",
    noMatch: (query) => `No settings match “${query}”.`,
    sections: {
      general: "General",
      tools: "External Tools",
      providers: "Providers",
      updates: "Updates",
    },
    themeFollows: (os, current) =>
      `Follows the ${os} appearance. Currently ${current}.`,
    themeFixed: (current, os) =>
      `Always ${current}, regardless of the ${os} appearance.`,
    openLast: "Open the last project at launch",
    setup: "Initial setup",
    setupHint: "Check external tools and OpenAI configuration again.",
    rerunSetup: "Run Setup Again",
    toolLocation: (tool) => `${tool} location`,
    autoFind: "Find automatically",
    autoDetect: "Detect Automatically",
    ffmpegHint:
      "Reads media and extracts audio for analysis. When empty, PATH and Homebrew are searched.",
    ytdlpHint:
      "Only needed for YouTube import. Downloads are never uploaded to OpenAI.",
    analysisProvider: "Analyze with",
    analysisProviderHint:
      "Transcription suggestions and speaker analysis both go to the provider chosen here.",
    analysisProviderLabel: "Provider used for analysis",
    inUse: "In use",
    keySource: "Key source",
    envVar: "Environment variable",
    keychain: "macOS keychain",
    replaceKey: "Replace API key",
    apiKey: "API key",
    saveToKeychain: "Save to Keychain",
    keySaved: "API key saved to the keychain.",
    envWins: ["When the", "environment variable is set, it takes priority."],
    noKeychain: [
      "Keys cannot be stored on this platform; set the",
      "environment variable.",
    ],
    removeHint: "Offline editing still works after removal.",
    removeConfirm: "Remove the API key from the keychain?",
    remove: "Remove",
    removeKey: "Remove Key",
    onlyOpenai: "Only OpenAI is supported for now.",
    addProvider: "Add Provider",
    uploadNote:
      "Selected audio is uploaded to the chosen provider only when you confirm an analysis.",
    currentVersion: "Current version",
    checking: "Checking…",
    newVersion: (version) => `Version ${version} available`,
    openDownload: "Go to Download Page",
    upToDate: "Up to date",
    justChecked: "Just checked",
    neverChecked: "Never checked",
    lastChecked: (time) => `Last checked: ${time}`,
    checkNow: "Check for Updates",
    autoUpdate: "Check for updates automatically",
    beta: "Receive beta versions",
    betaHint: "Get new features earlier; may be unstable.",
    updatesNote:
      "Checking for updates only contacts GitHub for version information. It never uploads subtitles or audio and never downloads new versions on its own.",
  },
  welcome: {
    tagline: "Subtitle correction · Speaker identification",
    steps: {
      welcome: "Welcome",
      tools: "External Tools",
      done: "Done",
    },
    title: "A few settings before you start",
    intro:
      "Mousqueau corrects existing SRT subtitles against the audio and helps review speakers. Next, it checks external tools and optionally sets up OpenAI.",
    facts: [
      "Files stay on this computer.",
      "Selected audio is uploaded only when you confirm an analysis.",
      "Offline editing works without OpenAI.",
    ],
    themeFollows: (os, current) =>
      `Follows the ${os} appearance. Currently ${current}`,
    changeLater: "You can change this later in Settings.",
    toolsTitle: "Check External Tools",
    toolsSearched: "Searched PATH, Homebrew and /usr/local/bin.",
    ffmpegMissing: "Needed to read media and analyze audio. ",
    ytdlpMissing: "Only needed for YouTube import. ",
    notFoundAt: ["No executable found at", "."],
    brewInstall: "Install with Homebrew: ",
    redetect: "Detect Again",
    toolsLater: "You can change locations later in Settings › External Tools.",
    openaiTitle: "Set Up OpenAI (Optional)",
    openaiIntro:
      "Used for transcription suggestions and speaker analysis. Selected audio is uploaded to OpenAI only when you confirm an analysis.",
    useEnv: (found) =>
      `Use the OPENAI_API_KEY environment variable (${found ? "detected" : "not detected"})`,
    enterKey: "Enter an API key",
    keepCurrent: "Keep the current configuration",
    skipKey: "Skip for now; edit offline only",
    keyKept: "Saved in the keychain; leave empty to keep it",
    keyStorage:
      "The key is stored in the macOS keychain and never written to project files. ",
    envStillWins: "The environment variable still takes priority when set.",
    needKey: "Enter an API key, or choose to skip for now.",
    doneTitle: "Setup Complete",
    changeAnytime: (keys) =>
      `You can change all of these later in Settings (${keys}).`,
    skip: "Skip Setup",
    previous: "Back",
    next: "Continue",
  },
};

const MESSAGES: Record<Locale, Messages> = { "zh-CN": zhCN, "en-US": enUS };

// Language names are shown in their own language.
export const LANGUAGE_NAMES: Record<Locale, string> = {
  "zh-CN": "简体中文",
  "en-US": "English (US)",
};

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}

// Mirrors Go's i18n.Match: every Chinese variant uses Simplified Chinese.
export function matchLocale(tag: string | null | undefined): Locale | null {
  const t = (tag ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (t === "zh" || t.startsWith("zh-")) return "zh-CN";
  if (t === "en" || t.startsWith("en-")) return "en-US";
  return null;
}

// Before Go answers: the last language used, then the browser's.
export function initialLocale(
  cached: string | null,
  languages: readonly string[],
): Locale {
  if (cached === "zh-CN" || cached === "en-US") return cached;
  for (const tag of languages) {
    const locale = matchLocale(tag);
    if (locale) return locale;
  }
  return "en-US";
}

const I18n = createContext<Messages>(enUS);
export const I18nProvider = I18n.Provider;
export function useT(): Messages {
  return useContext(I18n);
}

// Go errors arrive already translated; drop the "RuntimeError:" prefix.
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
