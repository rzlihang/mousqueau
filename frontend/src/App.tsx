import { useCallback, useEffect, useRef, useState } from "react";
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
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  theme,
} from "antd";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Snapshot, Status } from "../bindings/mousqueau/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import type { YouTubeInfo } from "../bindings/mousqueau/internal/media/models";
import { activeCue, changedText, formatTime, parseTime } from "./editor";
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
const colors = ["#1677ff", "#52c41a", "#d46b08"];
function EditorApp() {
  const { message, modal } = AntApp.useApp();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState("");
  const [active, setActive] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftDirty, setDraftDirty] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(60);
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
  const cue = cues.find((c) => c.id === selected);
  const busy = working || !!status?.busy;
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
  function selectCue(next: Cue) {
    const select = () => {
      video.current?.pause();
      setSelected(next.id);
      if (video.current) video.current.currentTime = next.start;
      setPlayhead(next.start);
    };
    if (draftDirty)
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
  function onPlayback() {
    const time = video.current?.currentTime ?? 0;
    setPlayhead(time);
    const playingCue = activeCue(cues, time);
    setActive(playingCue?.id ?? "");
    if (playingCue && !draftDirty && !video.current?.paused)
      setSelected(playingCue.id);
  }
  function changeDraft(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDraftDirty(true);
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
    if (video.current?.duration && rangeEnd > video.current.duration) {
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
  const speakerOptions = speakers.map((s) => ({ value: s.id, label: s.name }));
  const suggestions = p?.state.suggestions ?? [];
  return (
    <div className="shell">
      <header>
        <div>
          <strong>Mousqueau</strong>
          <span className="subtitle">字幕校正 · 说话人辨识</span>
        </div>
        <Space wrap>
          <Button
            disabled={busy || draftDirty}
            onClick={() => void update(Editor.ImportVideo)}
          >
            导入媒体
          </Button>
          <Button
            disabled={busy}
            onClick={() => replaceProject(Editor.ImportSRT)}
          >
            导入 SRT
          </Button>
          <Button
            disabled={busy}
            onClick={() => replaceProject(Editor.OpenProject)}
          >
            开启项目
          </Button>
          <Button disabled={busy || !p} onClick={() => void save(false)}>
            保存项目{dirty || draftDirty ? " •" : ""}
          </Button>
          <Button
            type="primary"
            disabled={busy || !p}
            onClick={() => void save(true)}
          >
            导出 SRT
          </Button>
        </Space>
      </header>
      <div className="statusbar">
        <Space wrap>
          <Tag color={status?.ffmpeg ? "green" : "orange"}>
            FFmpeg {status?.ffmpeg ? "已就绪" : "未安装"}
          </Tag>
          <Tag color={status?.apiConfigured ? "green" : "default"}>
            OpenAI {status?.apiConfigured ? "已配置" : "未配置 · 可离线编辑"}
          </Tag>
          <Button
            size="small"
            disabled={busy}
            onClick={() => setYoutubeOpen(true)}
          >
            YouTube 导入
          </Button>
          <Button
            size="small"
            disabled={busy}
            onClick={() => replaceProject(Editor.LoadDemo)}
          >
            载入示例
          </Button>
        </Space>
        {busy && (
          <Space>
            <Spin size="small" />
            <span>{status?.phase || "处理中…"}</span>
            <Button danger size="small" onClick={() => void Editor.Cancel()}>
              取消处理
            </Button>
          </Space>
        )}
      </div>
      <main className="workspace">
        <section className="panel media-panel">
          <h2>媒体与选取范围</h2>
          {snapshot?.mediaUrl ? (
            <video
              ref={video}
              key={snapshot.mediaUrl}
              src={snapshot.mediaUrl}
              controls
              onTimeUpdate={onPlayback}
              onSeeked={onPlayback}
              onError={() =>
                void message.error(
                  "媒体无法播放。请重新导入，或转为 MP4 / H.264 / AAC；字幕仍可编辑。",
                )
              }
            />
          ) : (
            <div className="video-placeholder">
              <Empty description="导入本机视频或音频" />
            </div>
          )}
          <p className="path">
            {snapshot?.mediaPath ||
              "文件保留在本机。仅确认分析时上传选定音频。"}
          </p>
          <div className="clock">{formatTime(playhead)}</div>
          <Space wrap>
            <Button
              disabled={!video.current || busy}
              onClick={() => {
                if (video.current) {
                  video.current.currentTime = Math.max(
                    0,
                    video.current.currentTime - 5,
                  );
                }
              }}
            >
              后退 5 秒
            </Button>
            <Button
              disabled={!video.current || busy}
              onClick={() => {
                if (video.current) video.current.currentTime += 5;
              }}
            >
              前进 5 秒
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setRangeStart(Math.floor(playhead));
                setRangeEnd(Math.floor(playhead) + 60);
              }}
            >
              以此处为起点
            </Button>
          </Space>
          <div className="range">
            <label>
              开始（秒）
              <InputNumber
                min={0}
                value={rangeStart}
                disabled={busy}
                onChange={(v) => setRangeStart(v ?? 0)}
              />
            </label>
            <label>
              结束（秒）
              <InputNumber
                min={0}
                value={rangeEnd}
                disabled={busy}
                onChange={(v) => setRangeEnd(v ?? 60)}
              />
            </label>
          </div>
          <p className="muted">每次 1–5 分钟。请自行确认选取范围与音频内容。</p>
          <Button
            block
            type="primary"
            disabled={
              busy ||
              !p ||
              !snapshot?.mediaPath ||
              !status?.apiConfigured ||
              !status?.ffmpeg
            }
            onClick={analyze}
          >
            上传所选音频并分析
          </Button>
          {!status?.apiConfigured && (
            <Alert
              className="notice"
              type="info"
              message="设置 OPENAI_API_KEY 后重启应用即可使用分析。API 密钥仅由 Go 后端读取。"
            />
          )}
          <Alert
            className="notice"
            type="info"
            message="标准 SRT 不包含说话人资料。保存 JSON 项目可保留说话人、建议与编辑历史。导出请选择新文件名。"
          />
        </section>
        <section className="panel cues-panel">
          <div className="section-heading">
            <h2>
              字幕 <span className="muted">{cues.length} 句</span>
            </h2>
            <Space>
              <Button
                disabled={busy || draftDirty || !p?.undo?.length}
                onClick={() => void update(Editor.Undo)}
              >
                撤销
              </Button>
              <Button
                disabled={busy || draftDirty || !p?.redo?.length}
                onClick={() => void update(Editor.Redo)}
              >
                重做
              </Button>
            </Space>
          </div>
          <div className="cue-list">
            {!cues.length && (
              <Empty description="导入 SRT 或载入示例开始编辑" />
            )}
            {cues.map((c) => (
              <button
                key={c.id}
                ref={(el) => {
                  rowRefs.current[c.id] = el;
                }}
                disabled={busy}
                className={`cue ${selected === c.id ? "selected" : ""} ${active === c.id ? "playing" : ""}`}
                onClick={() => selectCue(c)}
              >
                <div className="cue-meta">
                  <span>
                    #{c.identifier} · {formatTime(c.start)} →{" "}
                    {formatTime(c.end)}
                  </span>
                  {c.review && <Tag color="orange">待复核</Tag>}
                </div>
                <div className="cue-text">{c.text}</div>
                <div>
                  {c.speakerIds?.length ? (
                    c.speakerIds.map((id) => (
                      <Tag
                        key={id}
                        color={
                          speakers.find((s) => s.id === id)?.color || "default"
                        }
                      >
                        {speakers.find((s) => s.id === id)?.name || id}
                      </Tag>
                    ))
                  ) : (
                    <Tag>Unknown</Tag>
                  )}
                </div>
              </button>
            ))}
          </div>
          {cue && (
            <div className="cue-editor">
              <div className="section-heading">
                <h3>编辑 #{cue.identifier}</h3>
                {draftDirty && <Tag color="gold">尚未套用</Tag>}
              </div>
              <div className="time-fields">
                <label>
                  开始
                  <Input
                    disabled={busy}
                    value={draft.start}
                    onChange={(e) => changeDraft({ start: e.target.value })}
                  />
                </label>
                <label>
                  结束
                  <Input
                    disabled={busy}
                    value={draft.end}
                    onChange={(e) => changeDraft({ end: e.target.value })}
                  />
                </label>
              </div>
              <Input.TextArea
                disabled={busy}
                rows={3}
                value={draft.text}
                onChange={(e) => changeDraft({ text: e.target.value })}
              />
              <Select
                mode="multiple"
                disabled={busy}
                style={{ width: "100%" }}
                placeholder="Unknown · 未指派说话人"
                value={draft.speakerIds}
                options={speakerOptions}
                onChange={(speakerIds) => changeDraft({ speakerIds })}
              />
              <Space wrap>
                <Checkbox
                  disabled={busy}
                  checked={draft.review}
                  onChange={(e) => changeDraft({ review: e.target.checked })}
                >
                  需要复核
                </Checkbox>
                <Button
                  type="primary"
                  disabled={busy || !draftDirty}
                  onClick={() => void applyDraft()}
                >
                  套用编辑
                </Button>
                <Button
                  disabled={busy || !draftDirty}
                  onClick={() => {
                    setDraft({
                      text: cue.text,
                      start: formatTime(cue.start),
                      end: formatTime(cue.end),
                      speakerIds: cue.speakerIds ?? [],
                      review: cue.review,
                    });
                    setDraftDirty(false);
                  }}
                >
                  放弃未套用修改
                </Button>
              </Space>
            </div>
          )}
        </section>
        <section className="panel review-panel">
          <h2>说话人管理</h2>
          <p className="muted">
            不同分析范围的标签独立编号，可手动命名与指派。
          </p>
          <div className="speaker-list">
            {speakers.map((s) => (
              <div key={s.id}>
                <Tag color={s.color}>{s.name}</Tag>
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
          </div>
          <div className="speaker-form">
            <Input
              aria-label="说话人 ID"
              disabled={busy}
              value={speakerId}
              onChange={(e) => setSpeakerId(e.target.value)}
              placeholder="说话人 ID（A / B / C）"
            />
            <Input
              aria-label="显示名称"
              disabled={busy}
              value={speakerName}
              onChange={(e) => setSpeakerName(e.target.value)}
              placeholder="显示名称，例如：主持人"
            />
            <Button
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
          <h2>
            校正建议{" "}
            <span className="muted">
              {suggestions.filter((s) => s.status === "pending").length} 待审
            </span>
          </h2>
          {!suggestions.length && (
            <Empty description="分析音频或载入示例后查看建议" />
          )}
          <div className="suggestions">
            {suggestions.map((s) => (
              <article key={s.id} className={`suggestion ${s.status}`}>
                <div className="section-heading">
                  <strong>
                    字幕 #{cues.find((c) => c.id === s.cueId)?.identifier}
                  </strong>
                  <Tag color={s.review ? "orange" : "blue"}>
                    {s.status !== "pending"
                      ? s.status === "accepted"
                        ? "已接受"
                        : "已拒绝"
                      : s.review
                        ? "需人工复核"
                        : "待确认"}
                  </Tag>
                </div>
                <div className="comparison">
                  <div>
                    <label>分析时原文</label>
                    <p>
                      {changedText(s.original, s.proposed)
                        .filter((d) => !d.added)
                        .map((d, i) => (
                          <span key={i} className={d.removed ? "removed" : ""}>
                            {d.value}
                          </span>
                        ))}
                    </p>
                  </div>
                  <div>
                    <label>音频转录建议</label>
                    <p>
                      {changedText(s.original, s.proposed)
                        .filter((d) => !d.removed)
                        .map((d, i) => (
                          <span key={i} className={d.added ? "added" : ""}>
                            {d.value}
                          </span>
                        ))}
                    </p>
                  </div>
                </div>
                <div>
                  {(s.speakerIds ?? []).map((id) => (
                    <Tag
                      key={id}
                      color={speakers.find((sp) => sp.id === id)?.color}
                    >
                      {speakers.find((sp) => sp.id === id)?.name || id}
                    </Tag>
                  ))}
                </div>
                <p className="muted">
                  {s.review
                    ? "多人、重叠或跨句／范围边界：请对照音频确认文字与时间。"
                    : "以音频转录为依据，请确认忠实度与繁体用字。"}
                </p>
                <Space>
                  <Button
                    disabled={busy || s.status !== "pending" || draftDirty}
                    type="primary"
                    onClick={() =>
                      void update(() =>
                        Editor.DecideSuggestion(s.id, "accepted"),
                      )
                    }
                  >
                    {s.review ? "确认后接受" : "接受"}
                  </Button>
                  <Button
                    disabled={busy || s.status !== "pending" || draftDirty}
                    onClick={() =>
                      void update(() =>
                        Editor.DecideSuggestion(s.id, "rejected"),
                      )
                    }
                  >
                    拒绝
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      const target = cues.find((c) => c.id === s.cueId);
                      if (target) selectCue(target);
                    }}
                  >
                    定位字幕
                  </Button>
                </Space>
              </article>
            ))}
          </div>
        </section>
      </main>
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
            message="请先安装 yt-dlp 并加入 PATH。本机媒体与 SRT 导入不受影响。"
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
        <hr />
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
export default function App() {
  const [dark, setDark] = useState(
    () => localStorage.getItem("mousqueau-theme") === "dark",
  );
  return (
    <ConfigProvider
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: "#2867c7", borderRadius: 6 },
      }}
    >
      <AntApp>
        <div data-theme={dark ? "dark" : "light"}>
          <div className="theme-toggle">
            <span>深色</span>
            <Switch
              size="small"
              checked={dark}
              onChange={(value) => {
                setDark(value);
                localStorage.setItem(
                  "mousqueau-theme",
                  value ? "dark" : "light",
                );
              }}
            />
          </div>
          <EditorApp />
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
