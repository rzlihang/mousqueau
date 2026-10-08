import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Checkbox,
  ConfigProvider,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popover,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  theme,
} from "antd";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Snapshot, Status } from "../bindings/mousqueau/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import type { YouTubeInfo } from "../bindings/mousqueau/internal/media/models";
import { activeCue, formatTime, parseTime } from "./editor";
import {
  type CueFilter,
  cueStatus,
  filterCues,
  formatSeconds,
} from "./workspace";
import SuggestionCard, { SpeakerTag, SpeakerTags } from "./SuggestionCard";
import Timeline from "./Timeline";
import "./style.css";

type Draft = {
  text: string;
  start: string;
  end: string;
  speakerIds: string[];
  review: boolean;
};
const EMPTY_DRAFT: Draft = {
  text: "",
  start: "",
  end: "",
  speakerIds: [],
  review: false,
};
type Tab = "edit" | "speakers" | "suggestions";
type Wave =
  | { url: string; peaks: number[]; rate: number }
  | { url: string; error: string }
  | null;
const colors = ["#1677ff", "#52c41a", "#d46b08"];
const isMac = /Mac/.test(navigator.userAgent);

function UndoIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="64 64 896 896"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M511.4 124C290.5 124.3 112 303 112 523.9c0 128 60.2 242 153.8 315.2l-37.5 48c-4.1 5.3-.3 13 6.3 12.9l167-.8c5.2 0 9-4.9 7.7-9.9L369.8 727a8 8 0 00-14.1-3L315 776.1c-10.2-8-20-16.7-29.3-26a318.64 318.64 0 01-68.6-101.7C200.4 609 192 567.1 192 523.9s8.4-85.1 25.1-124.5c16.1-38.1 39.2-72.3 68.6-101.7 29.4-29.4 63.6-52.5 101.7-68.6C426.9 212.4 468.8 204 512 204s85.1 8.4 124.5 25.1c38.1 16.1 72.3 39.2 101.7 68.6 29.4 29.4 52.5 63.6 68.6 101.7 16.7 39.4 25.1 81.3 25.1 124.5s-8.4 85.1-25.1 124.5a318.64 318.64 0 01-68.6 101.7c-7.5 7.5-15.3 14.5-23.4 21.2a7.93 7.93 0 00-1.2 11.1l39.4 50.5c2.8 3.5 7.9 4.1 11.4 1.3C854.5 760.8 912 649.1 912 523.9c0-221.1-179.4-400.2-400.6-399.9z" />
    </svg>
  );
}
function RedoIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="64 64 896 896"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M758.2 839.1C851.8 765.9 912 651.9 912 523.9 912 303 733.5 124.3 512.6 124 291.4 123.7 112 302.8 112 523.9c0 125.2 57.5 236.9 147.6 310.2 3.5 2.8 8.6 2.2 11.4-1.3l39.4-50.5c2.7-3.4 2.1-8.3-1.2-11.1-8.1-6.6-15.9-13.7-23.4-21.2a318.64 318.64 0 01-68.6-101.7C200.4 609 192 567.1 192 523.9s8.4-85.1 25.1-124.5c16.1-38.1 39.2-72.3 68.6-101.7 29.4-29.4 63.6-52.5 101.7-68.6C426.9 212.4 468.8 204 512 204s85.1 8.4 124.5 25.1c38.1 16.1 72.3 39.2 101.7 68.6 29.4 29.4 52.5 63.6 68.6 101.7 16.7 39.4 25.1 81.3 25.1 124.5s-8.4 85.1-25.1 124.5a318.64 318.64 0 01-68.6 101.7c-9.3 9.3-19.1 18-29.3 26L668.2 724a8 8 0 00-14.1 3l-39.6 162.2c-1.2 5 2.6 9.9 7.7 9.9l167 .8c6.7 0 10.5-7.7 6.3-12.9l-37.3-47.9z" />
    </svg>
  );
}

function EditorApp({
  dark,
  setDark,
}: {
  dark: boolean;
  setDark: (dark: boolean) => void;
}) {
  const { message, modal } = AntApp.useApp();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftDirty, setDraftDirty] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [hasVideo, setHasVideo] = useState(true);
  const [wave, setWave] = useState<Wave>(null);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(60);
  const [tab, setTab] = useState<Tab>("edit");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CueFilter>("all");
  const [speakerId, setSpeakerId] = useState("A");
  const [speakerName, setSpeakerName] = useState("");
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [youtubeURL, setYoutubeURL] = useState("");
  const [info, setInfo] = useState<YouTubeInfo | null>(null);
  const [track, setTrack] = useState<number>();
  const [audioAuthorized, setAudioAuthorized] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const p = snapshot?.project;
  const cues = p?.state.cues ?? [];
  const speakers = p?.state.speakers ?? [];
  const suggestions = p?.state.suggestions ?? [];
  const cue = cues.find((c) => c.id === selected);
  const active = activeCue(cues, playhead);
  const busy = working || !!status?.busy;
  const mediaUrl = snapshot?.mediaUrl ?? "";
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const todoCount = cues.filter((c) => cueStatus(c, suggestions)).length;
  const shown = useMemo(
    () => filterCues(cues, suggestions, query, filter),
    [cues, suggestions, query, filter],
  );
  const duration = Math.max(
    60,
    mediaDuration,
    cues.length ? cues[cues.length - 1].end : 0,
    wave && "peaks" in wave ? wave.peaks.length / wave.rate : 0,
  );

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await Editor.GetStatus());
    } catch {
      /* runtime may be starting */
    }
  }, []);
  useEffect(() => {
    void Editor.GetSnapshot()
      .then(setSnapshot)
      .catch((e) => message.error(String(e)));
    void refreshStatus();
    const timer = setInterval(() => void refreshStatus(), 700);
    return () => clearInterval(timer);
  }, [message, refreshStatus]);
  useEffect(() => {
    if (cue) {
      setDraft({
        text: cue.text,
        start: formatTime(cue.start),
        end: formatTime(cue.end),
        speakerIds: cue.speakerIds ?? [],
        review: cue.review,
      });
    } else setDraft(EMPTY_DRAFT);
    setDraftDirty(false);
  }, [cue]);
  useEffect(() => {
    if (!cue && cues.length) setSelected(cues[0].id);
  }, [cue, cues]);
  useEffect(() => {
    rowRefs.current[selected]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selected]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty || draftDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, draftDirty]);
  // The waveform is decoded locally by FFmpeg in Go; nothing is uploaded.
  useEffect(() => {
    setWave(null);
    setMediaDuration(0);
    setHasVideo(true);
    setPlaying(false);
    if (!mediaUrl) return;
    let current = true;
    Editor.Waveform()
      .then((w) => {
        if (current && w.mediaUrl === mediaUrl)
          setWave({
            url: mediaUrl,
            peaks: w.peaks ?? [],
            rate: w.peaksPerSecond,
          });
      })
      .catch((e) => {
        if (current) setWave({ url: mediaUrl, error: String(e) });
      });
    return () => {
      current = false;
    };
  }, [mediaUrl]);
  // Follow the playhead smoothly while playing; timeupdate alone is too coarse.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (video.current) setPlayhead(video.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => {
    if (playing && active && !draftDirty) setSelected(active.id);
  }, [playing, active?.id, draftDirty]);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setWorking(true);
    try {
      return await action();
    } catch (e) {
      void message.error(String(e));
      return undefined;
    } finally {
      setWorking(false);
      void refreshStatus();
    }
  }
  async function update(action: () => Promise<Snapshot>) {
    const result = await run(action);
    if (result) {
      setSnapshot(result);
      setDirty(true);
    }
    return result;
  }
  async function applyDraft(): Promise<boolean> {
    if (!cue || !draftDirty) return true;
    try {
      const edited: Cue = {
        ...cue,
        text: draft.text,
        start: parseTime(draft.start),
        end: parseTime(draft.end),
        speakerIds: draft.speakerIds,
        review: draft.review,
      };
      if (edited.end <= edited.start)
        throw new Error("结束时间必须晚于开始时间。");
      return !!(await update(() => Editor.EditCue(edited)));
    } catch (e) {
      void message.error(String(e));
      return false;
    }
  }
  function discardDraft() {
    if (!cue) return;
    setDraft({
      text: cue.text,
      start: formatTime(cue.start),
      end: formatTime(cue.end),
      speakerIds: cue.speakerIds ?? [],
      review: cue.review,
    });
    setDraftDirty(false);
  }
  function replaceProject(action: () => Promise<Snapshot>) {
    const perform = async () => {
      const result = await update(action);
      if (result) {
        setSelected(result.project?.state.cues?.[0]?.id ?? "");
        setDraftDirty(false);
      }
    };
    if (p || draftDirty)
      modal.confirm({
        title: "开启另一份字幕／项目？",
        content: "当前项目将被替换。请先保存需要保留的编辑记录。",
        okText: "替换当前项目",
        cancelText: "返回",
        onOk: perform,
      });
    else void perform();
  }
  function seek(time: number) {
    if (video.current) video.current.currentTime = time;
    setPlayhead(time);
  }
  function selectCue(next: Cue) {
    const select = () => {
      video.current?.pause();
      setSelected(next.id);
      seek(next.start);
    };
    if (draftDirty && next.id !== selected)
      modal.confirm({
        title: "尚有未套用的编辑",
        content: "先套用当前字幕的文字、时间与说话人修改，再跳到下一句。",
        okText: "套用并跳转",
        cancelText: "留在当前字幕",
        onOk: async () => {
          if (!(await applyDraft())) throw new Error("请先修正编辑内容");
          select();
        },
      });
    else select();
  }
  function stepCue(delta: number) {
    const index = cues.findIndex((c) => c.id === selected);
    const next = cues[Math.min(cues.length - 1, Math.max(0, index + delta))];
    if (next) selectCue(next);
  }
  function togglePlay() {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch((e) => message.error(String(e)));
    else v.pause();
  }
  function changeDraft(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDraftDirty(true);
  }
  function setRange(start: number, end: number) {
    setRangeStart(Math.max(0, start));
    setRangeEnd(Math.max(0, end));
  }
  function analyze() {
    if (
      !Number.isFinite(rangeStart) ||
      rangeEnd - rangeStart < 60 ||
      rangeEnd - rangeStart > 300
    ) {
      void message.error("请选择 60–300 秒的范围。");
      return;
    }
    if (mediaDuration && rangeEnd > mediaDuration) {
      void message.error("选取范围超过媒体长度。");
      return;
    }
    modal.confirm({
      title: "将选定范围的音频上传到 OpenAI？",
      content: `${formatTime(rangeStart)} — ${formatTime(rangeEnd)}。此操作会将音频发送到外部 API，并可能产生费用。返回结果仅作为待审建议；不会自动修改字幕。`,
      okText: "确认上传并分析",
      cancelText: "取消",
      onOk: async () => {
        if (await applyDraft())
          await update(() => Editor.Analyze(rangeStart, rangeEnd, true));
      },
    });
  }
  async function save(exportSRT: boolean) {
    if (!(await applyDraft())) return;
    const path = await run(exportSRT ? Editor.ExportSRT : Editor.SaveProject);
    if (path) {
      void message.success(`已保存：${path}`);
      if (!exportSRT) setDirty(false);
    }
  }
  const canUndo = !busy && !draftDirty && !!p?.undo?.length;
  const canRedo = !busy && !draftDirty && !!p?.redo?.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        !(e.metaKey || e.ctrlKey) ||
        target.closest("input, textarea, [contenteditable], .ant-modal")
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey && canUndo) {
        e.preventDefault();
        void update(Editor.Undo);
      } else if (((key === "z" && e.shiftKey) || key === "y") && canRedo) {
        e.preventDefault();
        void update(Editor.Redo);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const speakerOptions = speakers.map((s) => ({ value: s.id, label: s.name }));
  const cueSuggestions = cue
    ? suggestions.filter((s) => s.cueId === cue.id)
    : [];
  const decide = (id: string) => (decision: "accepted" | "rejected") =>
    void update(() => Editor.DecideSuggestion(id, decision));
  const identifierOf = (cueId: string) =>
    cues.find((c) => c.id === cueId)?.identifier;
  const projectName = p?.subtitlePath
    ? p.subtitlePath
        .split(/[\\/]/)
        .pop()!
        .replace(/\.[^.]+$/, "")
    : p
      ? "未命名项目"
      : "未开启项目";
  const ready = !!status?.ffmpeg && !!status?.apiConfigured;
  const rangeSeconds = rangeEnd - rangeStart;
  const rangeValid = rangeSeconds >= 60 && rangeSeconds <= 300;
  const waveformNote = !mediaUrl
    ? "导入本机媒体后显示波形"
    : status && !status.ffmpeg
      ? "需要 FFmpeg 才能显示波形"
      : wave && "error" in wave
        ? "无法生成波形；字幕仍可编辑"
        : "正在本机生成波形…";

  return (
    <div className={`shell${isMac ? " mac" : ""}`}>
      <header className="titlebar">
        <div className="project-title">
          <strong>{projectName}</strong>
          <span>
            {p
              ? `${dirty || draftDirty ? "已编辑" : "未修改"} · ${cues.length} 句 · ${speakers.length} 位说话人`
              : "Mousqueau · 字幕校正与说话人辨识"}
          </span>
        </div>
        <div className="toolbar-group">
          <Button
            type="text"
            size="small"
            className="icon-button"
            aria-label="撤销"
            title={`撤销（${isMac ? "⌘Z" : "Ctrl+Z"}）`}
            disabled={!canUndo}
            onClick={() => void update(Editor.Undo)}
          >
            <UndoIcon />
          </Button>
          <Button
            type="text"
            size="small"
            className="icon-button"
            aria-label="重做"
            title={`重做（${isMac ? "⇧⌘Z" : "Ctrl+Shift+Z"}）`}
            disabled={!canRedo}
            onClick={() => void update(Editor.Redo)}
          >
            <RedoIcon />
          </Button>
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <Button
            size="small"
            disabled={busy || draftDirty}
            onClick={() => void update(Editor.ImportVideo)}
          >
            导入媒体
          </Button>
          <Button
            size="small"
            disabled={busy}
            onClick={() => replaceProject(Editor.ImportSRT)}
          >
            导入 SRT
          </Button>
          <Button
            size="small"
            disabled={busy}
            onClick={() => setYoutubeOpen(true)}
          >
            YouTube 导入
          </Button>
          <Button
            size="small"
            type="text"
            disabled={busy}
            onClick={() => replaceProject(Editor.LoadDemo)}
          >
            载入示例
          </Button>
        </div>
        <div className="spacer" />
        <div className="toolbar-group">
          <Button
            size="small"
            disabled={busy}
            onClick={() => replaceProject(Editor.OpenProject)}
          >
            开启项目
          </Button>
          <Button
            size="small"
            disabled={busy || !p}
            onClick={() => void save(false)}
          >
            保存项目{dirty || draftDirty ? " •" : ""}
          </Button>
          <Tooltip title="标准 SRT 不包含说话人资料。保存 JSON 项目可保留说话人、建议与编辑历史。导出请选择新文件名。">
            <Button
              size="small"
              type="primary"
              disabled={busy || !p}
              onClick={() => void save(true)}
            >
              导出 SRT
            </Button>
          </Tooltip>
        </div>
      </header>

      <div className="upper">
        <section className="cue-grid" aria-label="字幕列表">
          <div className="pane-toolbar">
            <h2>字幕</h2>
            <span className="muted">
              {cues.length} 句{todoCount ? ` · ${todoCount} 条待处理` : ""}
            </span>
            <div className="spacer" />
            <Input
              size="small"
              allowClear
              placeholder="搜索字幕文本"
              aria-label="搜索字幕文本"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              size="small"
              aria-label="筛选字幕"
              value={filter}
              onChange={setFilter}
              style={{ width: 96 }}
              options={[
                { value: "all", label: "全部" },
                { value: "todo", label: "待处理" },
                { value: "unknown", label: "Unknown" },
              ]}
            />
          </div>
          <div className="grid-head cue-columns" aria-hidden="true">
            <span>#</span>
            <span>开始</span>
            <span>时长</span>
            <span>说话人</span>
            <span>文本</span>
            <span>状态</span>
          </div>
          <div className="grid-body">
            {!cues.length && (
              <Empty description="导入 SRT 或载入示例开始编辑">
                <Space>
                  <Button
                    disabled={busy}
                    onClick={() => replaceProject(Editor.ImportSRT)}
                  >
                    导入 SRT
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => replaceProject(Editor.LoadDemo)}
                  >
                    载入示例
                  </Button>
                </Space>
              </Empty>
            )}
            {!!cues.length && !shown.length && (
              <p className="muted grid-empty">没有符合条件的字幕。</p>
            )}
            {shown.map((c) => {
              const st = cueStatus(c, suggestions);
              return (
                <button
                  key={c.id}
                  type="button"
                  ref={(el) => {
                    rowRefs.current[c.id] = el;
                  }}
                  disabled={busy}
                  aria-pressed={selected === c.id}
                  className={`cue-row cue-columns${selected === c.id ? " selected" : ""}${active?.id === c.id ? " playing" : ""}`}
                  onClick={() => selectCue(c)}
                >
                  <span className="mono muted small">{c.identifier}</span>
                  <span className="mono">{formatTime(c.start)}</span>
                  <span className="mono muted small">
                    {(c.end - c.start).toFixed(1)} 秒
                  </span>
                  <span className="tag-row">
                    <SpeakerTags ids={c.speakerIds} speakers={speakers} />
                  </span>
                  <span className="row-text">{c.text}</span>
                  <span>
                    {st && (
                      <Tag color={st === "review" ? "orange" : "blue"}>
                        {st === "review" ? "待复核" : "待确认"}
                      </Tag>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="viewer" aria-label="检视器">
          <div className="viewer-frame">
            {mediaUrl ? (
              <>
                <video
                  ref={video}
                  key={mediaUrl}
                  src={mediaUrl}
                  onClick={togglePlay}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    setMediaDuration(
                      Number.isFinite(v.duration) ? v.duration : 0,
                    );
                    setHasVideo(v.videoWidth > 0);
                    v.playbackRate = rate;
                  }}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onSeeked={(e) => setPlayhead(e.currentTarget.currentTime)}
                  onTimeUpdate={(e) =>
                    !playing && setPlayhead(e.currentTarget.currentTime)
                  }
                  onError={() =>
                    void message.error(
                      "媒体无法播放。请重新导入，或转为 MP4 / H.264 / AAC；字幕仍可编辑。",
                    )
                  }
                />
                {!hasVideo && <span className="viewer-note">仅音频</span>}
              </>
            ) : (
              <div className="viewer-empty">
                <span>导入本机视频或音频</span>
                <Button
                  size="small"
                  disabled={busy || draftDirty}
                  onClick={() => void update(Editor.ImportVideo)}
                >
                  导入媒体
                </Button>
              </div>
            )}
            {active && <div className="subtitle-overlay">{active.text}</div>}
          </div>
          <div className="transport">
            <div className="clock">
              <span>{formatTime(playhead)}</span>
              <span className="muted small">
                / {formatTime(mediaDuration || duration)}
              </span>
            </div>
            <div className="transport-buttons">
              <Button
                size="small"
                disabled={busy || !cues.length}
                onClick={() => stepCue(-1)}
              >
                上一句
              </Button>
              <Button size="small" disabled={!mediaUrl} onClick={togglePlay}>
                {playing ? "暂停" : "播放"}
              </Button>
              <Button
                size="small"
                disabled={busy || !cues.length}
                onClick={() => stepCue(1)}
              >
                下一句
              </Button>
            </div>
            <Select
              size="small"
              aria-label="播放速度"
              value={rate}
              style={{ width: 72 }}
              onChange={(value) => {
                setRate(value);
                if (video.current) video.current.playbackRate = value;
              }}
              options={[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => ({
                value: v,
                label: `${v.toFixed(v % 0.5 ? 2 : 1)}×`,
              }))}
            />
          </div>
        </section>

        <aside className="inspector" aria-label="检查器">
          <div className="inspector-tabs">
            <Segmented
              block
              size="small"
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              options={[
                { label: "编辑", value: "edit" },
                { label: "说话人", value: "speakers" },
                {
                  label: `校正建议${pendingCount ? ` ${pendingCount}` : ""}`,
                  value: "suggestions",
                },
              ]}
            />
          </div>
          <div className="inspector-body" key={tab}>
            {tab === "edit" &&
              (cue ? (
                <div className="stack">
                  <div className="section-heading">
                    <h3>编辑 #{cue.identifier}</h3>
                    <span className="mono muted tiny">
                      {formatTime(cue.start)} → {formatTime(cue.end)}
                    </span>
                  </div>
                  <div className="time-fields">
                    <label>
                      开始
                      <Input
                        size="small"
                        className="mono-input"
                        disabled={busy}
                        value={draft.start}
                        onChange={(e) => changeDraft({ start: e.target.value })}
                      />
                    </label>
                    <label>
                      结束
                      <Input
                        size="small"
                        className="mono-input"
                        disabled={busy}
                        value={draft.end}
                        onChange={(e) => changeDraft({ end: e.target.value })}
                      />
                    </label>
                  </div>
                  <span className="muted">
                    时长 {(cue.end - cue.start).toFixed(3)} 秒 · 字速{" "}
                    {(
                      cue.text.length / Math.max(0.001, cue.end - cue.start)
                    ).toFixed(1)}{" "}
                    字／秒
                  </span>
                  <label className="field">
                    文本
                    <Input.TextArea
                      disabled={busy}
                      autoSize={{ minRows: 2, maxRows: 5 }}
                      value={draft.text}
                      onChange={(e) => changeDraft({ text: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    说话人
                    <Select
                      mode="multiple"
                      size="small"
                      disabled={busy}
                      placeholder="Unknown · 未指派说话人"
                      value={draft.speakerIds}
                      options={speakerOptions}
                      onChange={(speakerIds) => changeDraft({ speakerIds })}
                    />
                  </label>
                  <Checkbox
                    disabled={busy}
                    checked={draft.review}
                    onChange={(e) => changeDraft({ review: e.target.checked })}
                  >
                    需要复核
                  </Checkbox>
                  <div className="apply-row">
                    {draftDirty ? (
                      <Tag color="gold">尚未套用</Tag>
                    ) : (
                      <span className="muted">尚无未套用的修改</span>
                    )}
                    <div className="spacer" />
                    <Button
                      size="small"
                      disabled={busy || !draftDirty}
                      onClick={discardDraft}
                    >
                      还原
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      disabled={busy || !draftDirty}
                      onClick={() => void applyDraft()}
                    >
                      套用编辑
                    </Button>
                  </div>
                  <div className="rule" />
                  <h3>本句校正建议</h3>
                  {cueSuggestions.length ? (
                    cueSuggestions.map((s) => (
                      <SuggestionCard
                        key={s.id}
                        suggestion={s}
                        cueIdentifier={cue.identifier}
                        speakers={speakers}
                        busy={busy}
                        draftDirty={draftDirty}
                        onDecide={decide(s.id)}
                      />
                    ))
                  ) : (
                    <span className="muted">
                      本句没有校正建议。在时间轴上选取范围后可上传分析。
                    </span>
                  )}
                </div>
              ) : (
                <Empty description="导入 SRT 或载入示例开始编辑" />
              ))}

            {tab === "speakers" && (
              <div className="stack">
                <span className="muted">
                  不同分析范围的标签独立编号，可手动命名与指派。
                </span>
                <div>
                  {speakers.map((s) => (
                    <div key={s.id} className="speaker-row">
                      <SpeakerTag speaker={s} />
                      <span className="muted">
                        {
                          cues.filter((c) => c.speakerIds?.includes(s.id))
                            .length
                        }{" "}
                        句
                      </span>
                      <div className="spacer" />
                      <Button
                        size="small"
                        type="text"
                        disabled={busy}
                        onClick={() => {
                          setSpeakerId(s.id);
                          setSpeakerName(s.name);
                        }}
                      >
                        编辑名称
                      </Button>
                    </div>
                  ))}
                  <div className="speaker-row">
                    <SpeakerTag />
                    <span className="muted">
                      {cues.filter((c) => !c.speakerIds?.length).length} 句
                    </span>
                  </div>
                </div>
                <div className="speaker-form">
                  <Input
                    size="small"
                    aria-label="说话人 ID"
                    disabled={busy}
                    value={speakerId}
                    onChange={(e) => setSpeakerId(e.target.value)}
                    placeholder="说话人 ID（A / B / C）"
                  />
                  <Input
                    size="small"
                    aria-label="显示名称"
                    disabled={busy}
                    value={speakerName}
                    onChange={(e) => setSpeakerName(e.target.value)}
                    placeholder="显示名称，例如：主持人"
                  />
                  <Button
                    size="small"
                    disabled={
                      busy ||
                      draftDirty ||
                      !p ||
                      !speakerId.trim() ||
                      !speakerName.trim()
                    }
                    onClick={() =>
                      void update(() =>
                        Editor.SetSpeaker({
                          id: speakerId.trim(),
                          name: speakerName.trim(),
                          color:
                            speakers.find((s) => s.id === speakerId)?.color ??
                            colors[speakers.length % colors.length],
                        }),
                      )
                    }
                  >
                    保存说话人
                  </Button>
                </div>
              </div>
            )}

            {tab === "suggestions" && (
              <div className="stack">
                <span className="muted">
                  建议不会自动改动字幕。每次接受都需要点击，并可撤销。
                </span>
                {!suggestions.length && (
                  <Empty description="分析音频或载入示例后查看建议" />
                )}
                {suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    cueIdentifier={identifierOf(s.cueId)}
                    speakers={speakers}
                    busy={busy}
                    draftDirty={draftDirty}
                    onDecide={decide(s.id)}
                    onLocate={() => {
                      const target = cues.find((c) => c.id === s.cueId);
                      if (target) selectCue(target);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <Timeline
        duration={duration}
        cues={cues}
        speakers={speakers}
        suggestions={suggestions}
        selectedId={selected}
        activeId={active?.id ?? ""}
        playhead={playhead}
        playing={playing}
        range={[rangeStart, rangeEnd]}
        waveform={wave && "peaks" in wave ? wave : null}
        waveformNote={waveformNote}
        dark={dark}
        busy={busy}
        onSeek={seek}
        onSelectCue={selectCue}
        onRangeChange={setRange}
        actions={
          <>
            <span className={rangeValid ? "" : "range-invalid"}>
              分析范围{" "}
              <span className="mono">
                {formatSeconds(rangeStart)} — {formatSeconds(rangeEnd)}
              </span>{" "}
              · {rangeSeconds} 秒
            </span>
            <span className="muted">每次 1–5 分钟</span>
            <Popover
              trigger="click"
              title="分析范围"
              content={
                <div className="range-form">
                  <label>
                    开始（秒）
                    <InputNumber
                      size="small"
                      min={0}
                      value={rangeStart}
                      disabled={busy}
                      onChange={(v) => setRangeStart(v ?? 0)}
                    />
                  </label>
                  <label>
                    结束（秒）
                    <InputNumber
                      size="small"
                      min={0}
                      value={rangeEnd}
                      disabled={busy}
                      onChange={(v) => setRangeEnd(v ?? 60)}
                    />
                  </label>
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() =>
                      setRange(Math.floor(playhead), Math.floor(playhead) + 60)
                    }
                  >
                    以播放头为起点
                  </Button>
                  <p className="muted">
                    也可以在时间刻度上拖动选取。请自行确认选取范围与音频内容。
                  </p>
                </div>
              }
            >
              <Button size="small" disabled={busy}>
                调整范围
              </Button>
            </Popover>
            <Button
              size="small"
              type="primary"
              disabled={
                busy ||
                !p ||
                !mediaUrl ||
                !status?.apiConfigured ||
                !status?.ffmpeg
              }
              onClick={analyze}
            >
              上传所选音频并分析
            </Button>
          </>
        }
      />

      <footer className="statusbar">
        <Popover
          trigger={["hover", "click"]}
          placement="topLeft"
          title="运行环境"
          content={
            <div className="env">
              <div>
                <span>FFmpeg</span>
                <Tag color={status?.ffmpeg ? "green" : "orange"}>
                  {status?.ffmpeg ? "已就绪" : "未安装"}
                </Tag>
              </div>
              <div>
                <span>OpenAI</span>
                <Tag color={status?.apiConfigured ? "green" : "default"}>
                  {status?.apiConfigured ? "已配置" : "未配置 · 可离线编辑"}
                </Tag>
              </div>
              <div>
                <span>yt-dlp</span>
                <Tag color={status?.ytdlp ? "green" : "default"}>
                  {status?.ytdlp ? "已就绪" : "未安装 · 可选"}
                </Tag>
              </div>
              {!status?.apiConfigured && (
                <p className="muted">
                  设置 OPENAI_API_KEY 后重启应用即可使用分析。API 密钥仅由 Go
                  后端读取。
                </p>
              )}
              <div className="rule" />
              <p className="muted">
                文件保留在本机。仅确认分析时上传选定音频。
              </p>
            </div>
          }
        >
          <button type="button" className="env-button">
            <span
              className={`dot ${ready ? "ok" : status?.ffmpeg ? "partial" : "warn"}`}
              aria-hidden="true"
            />
            {ready
              ? "环境就绪"
              : status?.ffmpeg
                ? "可离线编辑"
                : "FFmpeg 未安装"}
          </button>
        </Popover>
        {busy && (
          <Space size={6}>
            <Spin size="small" />
            <span>{status?.phase || "处理中…"}</span>
            <Button
              danger
              size="small"
              type="text"
              onClick={() => void Editor.Cancel()}
            >
              取消处理
            </Button>
          </Space>
        )}
        <div className="spacer" />
        {cue && (
          <span className="mono">
            已选 #{cue.identifier} · {formatTime(cue.start)} →{" "}
            {formatTime(cue.end)}
          </span>
        )}
        <label className="theme-toggle">
          深色
          <Switch
            size="small"
            checked={dark}
            onChange={(value) => {
              setDark(value);
              localStorage.setItem("mousqueau-theme", value ? "dark" : "light");
            }}
          />
        </label>
      </footer>

      <Modal
        title="可选 YouTube 导入"
        open={youtubeOpen}
        onCancel={() => setYoutubeOpen(false)}
        footer={null}
        width={650}
      >
        <p>
          仅支持单个视频。优先选择手动字幕；字幕下载与音频下载分别由你操作。
        </p>
        {!status?.ytdlp && (
          <Alert
            type="warning"
            title="请先安装 yt-dlp 并加入 PATH。本机媒体与 SRT 导入不受影响。"
          />
        )}
        <Space.Compact block>
          <Input
            value={youtubeURL}
            disabled={busy}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(e) => {
              setYoutubeURL(e.target.value);
              setInfo(null);
              setTrack(undefined);
              setAudioAuthorized(false);
            }}
          />
          <Button
            disabled={busy || !status?.ytdlp}
            onClick={async () => {
              const result = await run(() =>
                Editor.DiscoverYouTube(youtubeURL),
              );
              if (result) {
                setInfo(result);
                setTrack((result.captions ?? []).length ? 0 : undefined);
              }
            }}
          >
            发现字幕
          </Button>
        </Space.Compact>
        {info && (
          <div className="youtube-results">
            <h3>{info.title}</h3>
            {(info.captions ?? []).length ? (
              <Select
                style={{ width: "100%" }}
                value={track}
                disabled={busy}
                options={(info.captions ?? []).map((c, i) => ({
                  value: i,
                  label: `${c.language} · ${c.automatic ? "自动字幕" : "手动字幕（优先）"}`,
                }))}
                onChange={setTrack}
              />
            ) : (
              <Empty description="没有可导入的 SRT / VTT 字幕" />
            )}
            <Button
              className="notice"
              disabled={busy || track === undefined || !status?.ffmpeg}
              onClick={() => {
                const caption = info.captions![track!];
                replaceProject(() =>
                  Editor.ImportYouTubeCaption(
                    youtubeURL,
                    caption.language,
                    caption.automatic,
                  ),
                );
              }}
            >
              下载并导入所选字幕
            </Button>
          </div>
        )}
        <hr className="divider" />
        <Checkbox
          checked={audioAuthorized}
          disabled={busy}
          onChange={(e) => setAudioAuthorized(e.target.checked)}
        >
          我确认有权下载此视频的音频
        </Checkbox>
        <Button
          className="notice"
          block
          disabled={
            busy ||
            draftDirty ||
            !audioAuthorized ||
            !status?.ytdlp ||
            !status?.ffmpeg
          }
          onClick={() =>
            void update(() => Editor.DownloadYouTubeAudio(youtubeURL, true))
          }
        >
          另行下载音频到本机并载入
        </Button>
        <p className="muted">
          下载不会自动上传到 OpenAI。开始分析仍需另行确认。
        </p>
      </Modal>
    </div>
  );
}

// Contrast fixes from the design system: tag text and danger reach 4.5:1.
const LIGHT_FIXES = {
  colorError: "#cf1322",
  green7: "#237804",
  orange7: "#ad4e00",
  gold7: "#995b00",
};
const DARK_FIXES = { colorError: "#ff7875" };

export default function App() {
  const [dark, setDark] = useState(
    () => localStorage.getItem("mousqueau-theme") === "dark",
  );
  useLayoutEffect(() => {
    // WebKit uses the document background outside the page during overscroll.
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  return (
    <ConfigProvider
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#2867c7",
          borderRadius: 6,
          ...(dark ? DARK_FIXES : LIGHT_FIXES),
        },
      }}
    >
      <AntApp>
        <div data-theme={dark ? "dark" : "light"}>
          <EditorApp dark={dark} setDark={setDark} />
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
