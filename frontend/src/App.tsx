import { colors as themeColors } from "./colors.generated";
import {
  type ComponentRef,
  type CSSProperties,
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
  Badge,
  Button,
  Checkbox,
  ConfigProvider,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popover,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  theme,
} from "antd";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconDeviceFloppy,
  IconFileImport,
  IconFolderOpen,
  IconMenu2,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
} from "@tabler/icons-react";
import IconButton from "./IconButton";
import ImportDialog, { type ImportTab } from "./ImportDialog";
import {
  antdIconConfig,
  decorative,
  numberControls,
  statusIcon,
  useAntApp,
} from "./icons";
import { Events, Window } from "@wailsio/runtime";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Snapshot, Status } from "../bindings/mousqueau/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { activeCue, formatTime, parseTime } from "./editor";
import {
  type CueFilter,
  codePointOffset,
  cueStatus,
  dictionaryIssueIds,
  filterCues,
  formatSeconds,
  splitTime,
} from "./workspace";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import zhHK from "antd/locale/zh_HK";
import zhTW from "antd/locale/zh_TW";
import {
  type Locale,
  I18nProvider,
  errorText,
  initialLocale,
  matchLocale,
  messagesFor,
  useT,
} from "./i18n";
import {
  fontStack,
  providerCaution,
  resolveDark,
  themeChoice,
} from "./preferences";
import SettingsWindow from "./SettingsWindow";
import DictionaryWindow from "./DictionaryWindow";
import CueRows from "./CueRows";
import { HighlightedText } from "./dictionaryHighlight";
import SuggestionCard, { SpeakerTag } from "./SuggestionCard";
import Splitter from "./Splitter";
import Timeline from "./Timeline";
import {
  customChrome,
  isMac,
  isWindows,
  useSettings,
  useSystemDark,
} from "./useSettings";
import WindowControls from "./WindowControls";
import WelcomeWindow from "./WelcomeWindow";
import { showSampleImport } from "./sampleImport";
import type { Entry, Match } from "../bindings/mousqueau/internal/dictionary/models";
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
const settingsShortcut = isMac ? "⌘," : "Ctrl+,";

// Pane sizes the user dragged, in pixels; unset sizes follow the stylesheet.
type Layout = { left?: number; right?: number; timeline?: number };
const LAYOUT_KEY = "mousqueau-layout";
const VIEWER_MIN = 320;
function loadLayout(): Layout {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
    return value && typeof value === "object" ? (value as Layout) : {};
  } catch {
    return {};
  }
}

function EditorApp({
  dark,
  showSample,
}: {
  dark: boolean;
  showSample: boolean;
}) {
  const { message, modal } = useAntApp();
  const t = useT();
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
  const [importTab, setImportTab] = useState<ImportTab | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlayEditing, setOverlayEditing] = useState(false);
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const upperRef = useRef<HTMLDivElement>(null);
  const cueGridRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [matchesByCue, setMatchesByCue] = useState<Record<string, Match[]>>(
    {},
  );
  const [draftMatches, setDraftMatches] = useState<Match[]>([]);
  const [dictEntries, setDictEntries] = useState<Entry[]>([]);
  const [addDictOpen, setAddDictOpen] = useState(false);
  const [addDictMode, setAddDictMode] = useState<
    "canonical" | "misspelling" | "variant"
  >("canonical");
  const [addDictText, setAddDictText] = useState("");
  const [addDictTarget, setAddDictTarget] = useState<string>();
  const [addDictCategory, setAddDictCategory] = useState("term");
  const video = useRef<HTMLVideoElement>(null);
  const textArea = useRef<ComponentRef<typeof Input.TextArea>>(null);
  const focusOverlay = useRef(false);
  const p = snapshot?.project;
  const cues = p?.state.cues ?? [];
  const speakers = p?.state.speakers ?? [];
  const suggestions = p?.state.suggestions ?? [];
  const cueIndex = cues.findIndex((c) => c.id === selected);
  const cue = cueIndex < 0 ? undefined : cues[cueIndex];
  const previousCue = cueIndex > 0 ? cues[cueIndex - 1] : undefined;
  const nextCue = cueIndex < 0 ? undefined : cues[cueIndex + 1];
  const active = activeCue(cues, playhead);
  // The viewer keeps showing the cue being edited even if the playhead leaves it.
  const overlayCue = overlayEditing || draftDirty ? cue : active;
  const busy = working || !!status?.busy;
  const mediaUrl = snapshot?.mediaUrl ?? "";
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const todoCount = cues.filter((c) => cueStatus(c, suggestions)).length;
  const dictIssueIds = useMemo(
    () =>
      dictionaryIssueIds(
        Object.entries(matchesByCue).map(([cueId, matches]) => ({
          cueId,
          matches,
        })),
      ),
    [matchesByCue],
  );
  const shown = useMemo(
    () => filterCues(cues, suggestions, query, filter, dictIssueIds),
    [cues, suggestions, query, filter, dictIssueIds],
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
  const refreshDictionaryMatches = useCallback(async () => {
    try {
      const groups = (await Editor.MatchProjectCues()) ?? [];
      const map: Record<string, Match[]> = {};
      for (const g of groups) map[g.cueId] = g.matches ?? [];
      setMatchesByCue(map);
    } catch {
      setMatchesByCue({});
    }
  }, []);
  useEffect(() => {
    void Editor.GetSnapshot()
      .then(setSnapshot)
      .catch((e) => message.error(errorText(e)));
    void refreshStatus();
    void Editor.GetDictionary()
      .then((v) => setDictEntries(v.entries ?? []))
      .catch(() => setDictEntries([]));
    const timer = setInterval(() => void refreshStatus(), 700);
    const off = Events.On("dictionary", () => {
      void Editor.GetDictionary()
        .then((v) => setDictEntries(v.entries ?? []))
        .catch(() => undefined);
      void refreshDictionaryMatches();
    });
    return () => {
      clearInterval(timer);
      off();
    };
  }, [message, refreshStatus, refreshDictionaryMatches]);
  useEffect(() => {
    if (!p) {
      setMatchesByCue({});
      return;
    }
    void refreshDictionaryMatches();
  }, [p, refreshDictionaryMatches]);
  useEffect(() => {
    if (!draftDirty) {
      setDraftMatches(matchesByCue[selected] ?? []);
      return;
    }
    const handle = window.setTimeout(() => {
      void Editor.MatchText(draft.text)
        .then((m) => setDraftMatches(m ?? []))
        .catch(() => setDraftMatches([]));
    }, 150);
    return () => clearTimeout(handle);
  }, [draft.text, draftDirty, matchesByCue, selected]);
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
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      /* pane sizes are only a convenience */
    }
  }, [layout]);
  useEffect(() => {
    if (focusOverlay.current && cue) {
      focusOverlay.current = false;
      textArea.current?.focus();
    }
  }, [cue?.id]);
  useEffect(() => {
    if (!cue && cues.length) setSelected(cues[0].id);
  }, [cue, cues]);
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
        if (current) setWave({ url: mediaUrl, error: errorText(e) });
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
  // A web view's video does not keep the display awake, so Go holds it
  // while playing; failing to only means the screen saver may start.
  useEffect(() => {
    void Editor.KeepAwake(playing).catch(() => undefined);
  }, [playing]);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setWorking(true);
    try {
      return await action();
    } catch (e) {
      void message.error(errorText(e));
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
        start: parseTime(draft.start, t.editor.invalidTime),
        end: parseTime(draft.end, t.editor.invalidTime),
        speakerIds: draft.speakerIds,
        review: draft.review,
      };
      if (edited.end <= edited.start) throw new Error(t.editor.endBeforeStart);
      return !!(await update(() => Editor.EditCue(edited)));
    } catch (e) {
      void message.error(errorText(e));
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
  // Resolves with the new snapshot, or undefined when the user backs out
  // of the confirmation or the import fails.
  function replaceProject(
    action: () => Promise<Snapshot>,
  ): Promise<Snapshot | undefined> {
    return new Promise((resolve) => {
      const perform = async () => {
        const result = await update(action);
        if (result) {
          setSelected(result.project?.state.cues?.[0]?.id ?? "");
          setDraftDirty(false);
        }
        resolve(result);
      };
      if (p || draftDirty)
        modal.confirm({
          title: t.editor.replaceTitle,
          content: t.editor.replaceContent,
          okText: t.editor.replaceOk,
          cancelText: t.common.back,
          onOk: perform,
          onCancel: () => resolve(undefined),
        });
      else void perform();
    });
  }
  // A cancelled file picker returns the snapshot unchanged; only a new
  // project or new media closes the import dialog.
  const replaced = (next: Snapshot | undefined) =>
    !!next && next.project !== null && !sameProject(next.project, p);
  const mediaChanged = (next: Snapshot | undefined) =>
    !!next && next.mediaUrl !== snapshot?.mediaUrl;
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
        title: t.editor.unappliedTitle,
        content: t.editor.unappliedContent,
        okText: t.editor.unappliedOk,
        cancelText: t.editor.unappliedCancel,
        onOk: async () => {
          if (!(await applyDraft())) throw new Error(t.editor.fixDraftFirst);
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
    if (v.paused) void v.play().catch((e) => message.error(errorText(e)));
    else v.pause();
  }
  // Splits at the text cursor; the time follows the playhead when it is
  // inside the cue, otherwise the share of text before the cursor.
  function splitCue() {
    if (!cue) return;
    const caret = textArea.current?.resizableTextArea?.textArea.selectionStart;
    const offset = codePointOffset(cue.text, caret ?? 0);
    const length = Array.from(cue.text).length;
    if (offset <= 0 || offset >= length) {
      void message.info(t.inspector.splitNeedsCursor);
      return;
    }
    const at = splitTime(cue.start, cue.end, playhead, offset / length);
    void update(() => Editor.SplitCue(cue.id, at, offset));
  }
  // Merging with the previous cue keeps the previous cue's ID, so select it.
  async function mergeCues(first: Cue) {
    if (await update(() => Editor.MergeCues(first.id))) setSelected(first.id);
  }
  const widthOf = (el: HTMLElement | null) =>
    el?.getBoundingClientRect().width ?? 0;
  function resizeColumn(side: "left" | "right", size: number) {
    const other = side === "left" ? inspectorRef.current : cueGridRef.current;
    const max = widthOf(upperRef.current) - widthOf(other) - VIEWER_MIN;
    const min = side === "left" ? 240 : 260;
    setLayout((l) => ({
      ...l,
      [side]: Math.round(Math.max(min, Math.min(size, max))),
    }));
  }
  // The timeline can shrink, with its tracks scrolling, but never grow past
  // its content.
  function resizeTimeline(size: number) {
    const section = dockRef.current?.querySelector<HTMLElement>(".timeline");
    let natural = 0;
    for (const child of Array.from(section?.children ?? []) as HTMLElement[])
      natural += child.classList.contains("timeline-body")
        ? child.scrollHeight
        : child.offsetHeight;
    const max = Math.min(natural || Infinity, window.innerHeight - 340);
    setLayout((l) => ({
      ...l,
      timeline: Math.round(Math.max(80, Math.min(size, max))),
    }));
  }
  function resetLayout(key: keyof Layout) {
    setLayout((l) => ({ ...l, [key]: undefined }));
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
      void message.error(t.editor.rangeLength);
      return;
    }
    if (mediaDuration && rangeEnd > mediaDuration) {
      void message.error(t.editor.rangeBeyondMedia);
      return;
    }
    const caution =
      status &&
      providerCaution(
        { caution: status.providerCaution, region: status.providerRegion },
        t,
      );
    modal.confirm({
      title: t.editor.uploadTitle(status?.provider ?? ""),
      content: (
        <div className="stack">
          <span>
            {t.editor.uploadContent(
              `${formatTime(rangeStart)} — ${formatTime(rangeEnd)}`,
            )}
          </span>
          {caution && <Alert
              type="warning"
              showIcon
              icon={statusIcon.warning}
              title={caution}
            />}
        </div>
      ),
      okText: t.editor.uploadOk,
      cancelText: t.common.cancel,
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
      void message.success(t.editor.saved(path));
      if (!exportSRT) setDirty(false);
    }
  }
  // The welcome window hands over the first action chosen at the end of setup.
  const replaceRef = useRef(replaceProject);
  replaceRef.current = replaceProject;
  useEffect(() => {
    const take = () =>
      void Editor.TakePendingAction()
        .then((action) => {
          if (action === "demo") replaceRef.current(Editor.LoadDemo);
          else if (action === "srt") replaceRef.current(Editor.ImportSRT);
        })
        .catch(() => {
          /* runtime may be starting */
        });
    take();
    const offAction = Events.On("pending-action", take);
    const offUpdate = Events.On("update-available", (e) =>
      message.info(t.editor.updateAvailable(String(e.data))),
    );
    return () => {
      offAction();
      offUpdate();
    };
  }, [message, t]);
  const canUndo = !busy && !draftDirty && !!p?.undo?.length;
  const canRedo = !busy && !draftDirty && !!p?.redo?.length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // On macOS the application menu owns this shortcut.
      if (!isMac && e.ctrlKey && e.key === ",") {
        e.preventDefault();
        void Editor.OpenSettings();
        return;
      }
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
      ? t.editor.untitled
      : t.editor.noProject;
  const ready = !!status?.ffmpeg && !!status?.apiConfigured;
  const rangeSeconds = rangeEnd - rangeStart;
  const rangeValid = rangeSeconds >= 60 && rangeSeconds <= 300;
  const waveformNote = !mediaUrl
    ? t.editor.waveNoMedia
    : status && !status.ffmpeg
      ? t.editor.waveNeedsFfmpeg
      : wave && "error" in wave
        ? t.editor.waveFailed
        : t.editor.waveLoading;

  return (
    <div
      className={`shell${isMac ? " mac" : ""}${customChrome ? " custom-chrome" : ""}`}
    >
      <header
        className="titlebar"
        onDoubleClick={(e) => {
          // Wails acts on title bar double-clicks only on macOS.
          if (
            customChrome &&
            e.target instanceof Element &&
            !e.target.closest("button, input, textarea, a, .ant-select")
          )
            void Window.ToggleMaximise();
        }}
      >
        {!isMac && (
          <Dropdown
            trigger={["click"]}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            menu={{
              onClick: () => setMenuOpen(false),
              items: [
                {
                  type: "group",
                  key: "file",
                  label: t.menu.file,
                  children: [
                    {
                      key: "open",
                      label: t.editor.openProject,
                      disabled: busy,
                      onClick: () => replaceProject(Editor.OpenProject),
                    },
                    {
                      key: "save",
                      label: t.editor.saveProject,
                      disabled: busy || !p,
                      onClick: () => void save(false),
                    },
                    {
                      key: "export",
                      label: t.editor.exportSrt,
                      disabled: busy || !p,
                      onClick: () => void save(true),
                    },
                    {
                      key: "media",
                      label: t.common.importMedia,
                      disabled: busy || draftDirty,
                      onClick: () => void update(Editor.ImportVideo),
                    },
                    {
                      key: "srt",
                      label: t.common.importSrt,
                      disabled: busy,
                      onClick: () => replaceProject(Editor.ImportSRT),
                    },
                    {
                      key: "web",
                      label: t.editor.importWeb,
                      disabled: busy,
                      onClick: () => setImportTab("web"),
                    },
                    ...(showSample
                      ? [
                          {
                            key: "demo",
                            label: t.common.loadDemo,
                            disabled: busy,
                            onClick: () => replaceProject(Editor.LoadDemo),
                          },
                        ]
                      : []),
                  ],
                },
                { type: "divider" },
                {
                  type: "group",
                  key: "edit",
                  label: t.menu.edit,
                  children: [
                    {
                      key: "undo",
                      label: t.editor.withShortcut(t.editor.undo, "Ctrl+Z"),
                      disabled: !canUndo,
                      onClick: () => void update(Editor.Undo),
                    },
                    {
                      key: "redo",
                      label: t.editor.withShortcut(t.editor.redo, "Ctrl+Shift+Z"),
                      disabled: !canRedo,
                      onClick: () => void update(Editor.Redo),
                    },
                    {
                      key: "settings",
                      label: t.editor.withShortcut(t.settings.title, settingsShortcut),
                      onClick: () => void run(Editor.OpenSettings),
                    },
                    {
                      key: "dictionary",
                      label: t.inspector.dictionaryOpen,
                      onClick: () => void run(Editor.OpenDictionary),
                    },
                  ],
                },
                ...(customChrome
                  ? [
                      { type: "divider" as const },
                      {
                        type: "group" as const,
                        key: "window",
                        label: t.menu.window,
                        children: [
                          {
                            key: "minimise",
                            label: t.window.minimise,
                            onClick: () => void Window.Minimise(),
                          },
                          {
                            key: "maximise",
                            label: t.menu.toggleMaximise,
                            onClick: () => void Window.ToggleMaximise(),
                          },
                          {
                            key: "close",
                            label: t.window.close,
                            onClick: () => void Window.Close(),
                          },
                        ],
                      },
                    ]
                  : []),
              ],
            }}
          >
            <Button
              type="text"
              size="small"
              className="icon-button"
              aria-label={t.menu.title}
              title={t.menu.title}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              icon={<IconMenu2 size={16} {...decorative} />}
            />
          </Dropdown>
        )}
        <div className="project-title">
          <strong>{projectName}</strong>
          <span>
            {p
              ? `${dirty || draftDirty ? t.editor.edited : t.editor.unchanged} · ${t.common.cues(cues.length)} · ${t.editor.speakerCount(speakers.length)}`
              : t.editor.tagline}
          </span>
        </div>
        <div className="toolbar-group">
          <IconButton
            type="text"
            size="small"
            className="icon-button"
            placement="bottom"
            label={t.editor.undo}
            tooltip={t.editor.withShortcut(
              t.editor.undo,
              isMac ? "⌘Z" : "Ctrl+Z",
            )}
            disabled={!canUndo}
            onClick={() => void update(Editor.Undo)}
            icon={<IconArrowBackUp size={16} {...decorative} />}
          />
          <IconButton
            type="text"
            size="small"
            className="icon-button"
            placement="bottom"
            label={t.editor.redo}
            tooltip={t.editor.withShortcut(
              t.editor.redo,
              isMac ? "⇧⌘Z" : "Ctrl+Shift+Z",
            )}
            disabled={!canRedo}
            onClick={() => void update(Editor.Redo)}
            icon={<IconArrowForwardUp size={16} {...decorative} />}
          />
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <IconButton
            type="text"
            size="small"
            className="icon-button"
            placement="bottom"
            label={t.importer.title}
            onClick={() => setImportTab("local")}
            icon={<IconFileImport size={16} {...decorative} />}
          />
          {showSample && (
            <Button
              size="small"
              type="text"
              disabled={busy}
              onClick={() => replaceProject(Editor.LoadDemo)}
            >
              {t.common.loadDemo}
            </Button>
          )}
        </div>
        <div className="spacer" />
        <div className="toolbar-group">
          <IconButton
            type="text"
            size="small"
            className="icon-button"
            placement="bottom"
            label={t.editor.openProject}
            disabled={busy}
            onClick={() => replaceProject(Editor.OpenProject)}
            icon={<IconFolderOpen size={16} {...decorative} />}
          />
          <IconButton
            type="text"
            size="small"
            className="icon-button"
            placement="bottom"
            label={t.editor.saveProject}
            disabled={busy || !p}
            onClick={() => void save(false)}
            icon={
              <Badge
                dot={dirty || draftDirty}
                color="var(--accent)"
                offset={[-1, 2]}
              >
                <IconDeviceFloppy size={16} {...decorative} />
              </Badge>
            }
          />
          <Tooltip title={t.editor.exportHint}>
            <Button
              size="small"
              type="primary"
              disabled={busy || !p}
              onClick={() => void save(true)}
            >
              {t.editor.exportSrt}
            </Button>
          </Tooltip>
        </div>
        {customChrome && <WindowControls maximise />}
      </header>

      <div
        className="upper"
        ref={upperRef}
        style={{
          gridTemplateColumns: [
            layout.left
              ? `minmax(240px, ${layout.left}px)`
              : "minmax(400px, 1.2fr)",
            `minmax(${VIEWER_MIN}px, 1fr)`,
            layout.right ? `minmax(260px, ${layout.right}px)` : "340px",
          ].join(" "),
        }}
      >
        <section
          className="cue-grid"
          ref={cueGridRef}
          aria-label={t.cueList.label}
        >
          <div className="pane-toolbar">
            <h2>{t.cueList.title}</h2>
            <span className="muted">
              {t.common.cues(cues.length)}
              {todoCount ? t.cueList.todo(todoCount) : ""}
            </span>
            <div className="spacer" />
            <Input
              size="small"
              allowClear
              placeholder={t.cueList.search}
              aria-label={t.cueList.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select
              size="small"
              aria-label={t.cueList.filter}
              value={filter}
              onChange={setFilter}
              style={{ width: 128 }}
              options={[
                { value: "all", label: t.cueList.all },
                { value: "todo", label: t.cueList.todoFilter },
                { value: "unknown", label: t.common.unknownSpeaker },
                {
                  value: "dictionary",
                  label: t.cueList.dictionaryFilter,
                },
              ]}
            />
          </div>
          <div className="grid-head cue-columns" aria-hidden="true">
            <span>#</span>
            <span>{t.cueList.columns.start}</span>
            <span>{t.cueList.columns.duration}</span>
            <span>{t.cueList.columns.speakers}</span>
            <span>{t.cueList.columns.text}</span>
            <span>{t.cueList.columns.status}</span>
          </div>
          <CueRows
            cues={shown}
            speakers={speakers}
            suggestions={suggestions}
            matchesByCue={matchesByCue}
            selectedId={selected}
            activeId={active?.id ?? ""}
            busy={busy}
            onSelect={selectCue}
          >
            {!cues.length && (
              <Empty
                description={
                  showSample ? t.common.emptyProject : t.common.startImport
                }
              >
                <Space>
                  <Button
                    disabled={busy}
                    onClick={() => replaceProject(Editor.ImportSRT)}
                  >
                    {t.common.importSrt}
                  </Button>
                  {showSample && (
                    <Button
                      disabled={busy}
                      onClick={() => replaceProject(Editor.LoadDemo)}
                    >
                      {t.common.loadDemo}
                    </Button>
                  )}
                </Space>
              </Empty>
            )}
            {!!cues.length && !shown.length && (
              <p className="muted grid-empty">{t.cueList.noMatch}</p>
            )}
          </CueRows>
        </section>

        <section className="viewer" aria-label={t.viewer.label}>
          <Splitter
            axis="x"
            sign={1}
            label={t.common.resizeWidth}
            start={() => widthOf(cueGridRef.current)}
            onResize={(size) => resizeColumn("left", size)}
            onReset={() => resetLayout("left")}
          />
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
                  onError={() => void message.error(t.viewer.mediaError)}
                />
                {!hasVideo && (
                  <span className="viewer-note">{t.viewer.audioOnly}</span>
                )}
              </>
            ) : (
              <div className="viewer-empty">
                <span>{t.viewer.empty}</span>
                <Button
                  size="small"
                  disabled={busy || draftDirty}
                  onClick={() => void update(Editor.ImportVideo)}
                >
                  {t.common.importMedia}
                </Button>
              </div>
            )}
            {overlayCue && (
              <div className="subtitle-overlay">
                {overlayCue.id === cue?.id ? (
                  <Input.TextArea
                    ref={textArea}
                    className="subtitle-text subtitle-edit"
                    variant="borderless"
                    disabled={busy}
                    autoSize
                    aria-label={t.inspector.text}
                    title={t.viewer.clickToEdit}
                    placeholder={t.viewer.textPlaceholder}
                    value={draft.text}
                    onFocus={() => {
                      video.current?.pause();
                      setTab("edit");
                      setOverlayEditing(true);
                    }}
                    onBlur={() => setOverlayEditing(false)}
                    onChange={(e) => changeDraft({ text: e.target.value })}
                  />
                ) : (
                  <button
                    type="button"
                    className="subtitle-edit"
                    title={t.viewer.clickToEdit}
                    disabled={busy}
                    onClick={() => {
                      focusOverlay.current = true;
                      setTab("edit");
                      selectCue(overlayCue);
                    }}
                  >
                    {overlayCue.text}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="transport">
            <div className="clock">
              <span>{formatTime(playhead)}</span>
              <span className="muted small">
                / {formatTime(mediaDuration || duration)}
              </span>
            </div>
            <div className="transport-buttons">
              <IconButton
                label={t.viewer.previous}
                icon={<IconPlayerSkipBack size={18} {...decorative} />}
                disabled={busy || !cues.length}
                onClick={() => stepCue(-1)}
              />
              <IconButton
                label={playing ? t.viewer.pause : t.viewer.play}
                icon={
                  playing ? (
                    <IconPlayerPause size={18} {...decorative} />
                  ) : (
                    <IconPlayerPlay size={18} {...decorative} />
                  )
                }
                disabled={!mediaUrl}
                onClick={togglePlay}
              />
              <IconButton
                label={t.viewer.next}
                icon={<IconPlayerSkipForward size={18} {...decorative} />}
                disabled={busy || !cues.length}
                onClick={() => stepCue(1)}
              />
            </div>
            <Select
              size="small"
              aria-label={t.viewer.speed}
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

        <aside
          className="inspector"
          ref={inspectorRef}
          aria-label={t.inspector.label}
        >
          <Splitter
            axis="x"
            sign={-1}
            label={t.common.resizeWidth}
            start={() => widthOf(inspectorRef.current)}
            onResize={(size) => resizeColumn("right", size)}
            onReset={() => resetLayout("right")}
          />
          <div className="inspector-tabs">
            <Segmented
              block
              size="small"
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              options={[
                { label: t.inspector.edit, value: "edit" },
                { label: t.inspector.speakers, value: "speakers" },
                {
                  label: `${t.inspector.suggestions}${pendingCount ? ` ${pendingCount}` : ""}`,
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
                    <h3>{t.inspector.editing(cue.identifier)}</h3>
                    <span className="mono muted tiny">
                      {formatTime(cue.start)} → {formatTime(cue.end)}
                    </span>
                  </div>
                  <div className="time-fields">
                    <label>
                      {t.inspector.start}
                      <Input
                        size="small"
                        className="mono-input"
                        disabled={busy}
                        value={draft.start}
                        onChange={(e) => changeDraft({ start: e.target.value })}
                      />
                    </label>
                    <label>
                      {t.inspector.end}
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
                    {t.inspector.stats(
                      (cue.end - cue.start).toFixed(3),
                      (
                        cue.text.length / Math.max(0.001, cue.end - cue.start)
                      ).toFixed(1),
                    )}
                  </span>
                  <span className="muted">{t.inspector.textInViewer}</span>
                  {!!draftMatches.length && (
                    <p className="dict-preview muted small">
                      <HighlightedText
                        text={draft.text}
                        matches={draftMatches}
                      />
                    </p>
                  )}
                  <label className="field">
                    {t.inspector.speaker}
                    <Select
                      mode="multiple"
                      size="small"
                      disabled={busy}
                      placeholder={t.inspector.unassigned}
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
                    {t.inspector.needsReview}
                  </Checkbox>
                  <div className="apply-row">
                    {draftDirty ? (
                      <Tag color="gold">{t.inspector.unapplied}</Tag>
                    ) : (
                      <span className="muted">
                        {t.inspector.nothingUnapplied}
                      </span>
                    )}
                    <div className="spacer" />
                    <Button
                      size="small"
                      disabled={busy || !draftDirty}
                      onClick={discardDraft}
                    >
                      {t.inspector.revert}
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      disabled={busy || !draftDirty}
                      onClick={() => void applyDraft()}
                    >
                      {t.inspector.apply}
                    </Button>
                  </div>
                  <div className="structure-row">
                    <Button
                      size="small"
                      disabled={busy || draftDirty || !previousCue}
                      onClick={() => previousCue && void mergeCues(previousCue)}
                    >
                      {t.inspector.mergePrevious}
                    </Button>
                    <Tooltip title={t.inspector.splitHint}>
                      <Button
                        size="small"
                        disabled={busy || draftDirty}
                        onClick={splitCue}
                      >
                        {t.inspector.split}
                      </Button>
                    </Tooltip>
                    <Button
                      size="small"
                      disabled={busy || draftDirty || !nextCue}
                      onClick={() => void mergeCues(cue)}
                    >
                      {t.inspector.mergeNext}
                    </Button>
                  </div>
                  <div className="rule" />
                  <h3>{t.inspector.dictionary}</h3>
                  <span className="muted">{t.inspector.dictionaryHint}</span>
                  <strong>{t.inspector.dictionaryHits}</strong>
                  {!draftMatches.length && (
                    <span className="muted">{t.inspector.dictionaryNone}</span>
                  )}
                  {draftMatches.map((m, i) => (
                    <div key={`${m.entryId}-${i}`} className="dict-hit-row">
                      <Tag
                        color={m.kind === "misspelled" ? "error" : "default"}
                      >
                        {m.kind === "misspelled"
                          ? t.dictionary.kindMisspelled
                          : t.dictionary.kindKnown}
                      </Tag>
                      <span>
                        {m.kind === "misspelled"
                          ? `${m.text} → ${m.canonical}`
                          : m.text}
                      </span>
                      {m.kind === "misspelled" && cue && (
                        <Button
                          size="small"
                          disabled={busy || draftDirty}
                          onClick={() =>
                            void update(() =>
                              Editor.FixCueFromDictionary(cue.id),
                            ).then(() => void refreshDictionaryMatches())
                          }
                        >
                          {t.inspector.dictionaryFix}
                        </Button>
                      )}
                    </div>
                  ))}
                  <Space wrap>
                    <Button
                      size="small"
                      disabled={busy || !p}
                      onClick={() => {
                        const el =
                          textArea.current?.resizableTextArea?.textArea;
                        const start = el?.selectionStart ?? 0;
                        const end = el?.selectionEnd ?? 0;
                        const raw =
                          el && end > start
                            ? draft.text.slice(start, end).trim()
                            : "";
                        setAddDictText(raw);
                        setAddDictMode(raw ? "misspelling" : "canonical");
                        setAddDictTarget(undefined);
                        setAddDictOpen(true);
                        if (!raw)
                          void message.info(t.inspector.dictionaryNeedSelection);
                      }}
                    >
                      {t.inspector.dictionaryAddSelection}
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      disabled={busy || !p}
                      onClick={() =>
                        void update(async () => {
                          const snap = await Editor.CheckDictionary();
                          const count = (
                            snap.project?.state.suggestions ?? []
                          ).filter(
                            (s) =>
                              s.source === "dictionary" &&
                              s.status === "pending",
                          ).length;
                          void message.success(t.dictionary.checked(count));
                          void refreshDictionaryMatches();
                          return snap;
                        })
                      }
                    >
                      {t.inspector.dictionaryCheck}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => void Editor.OpenDictionary()}
                    >
                      {t.inspector.dictionaryOpen}
                    </Button>
                  </Space>
                  <div className="rule" />
                  <h3>{t.inspector.cueSuggestions}</h3>
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
                      {t.inspector.noCueSuggestions}
                    </span>
                  )}
                </div>
              ) : (
                <Empty
                  description={
                    showSample ? t.common.emptyProject : t.common.startImport
                  }
                />
              ))}

            {tab === "speakers" && (
              <div className="stack">
                <span className="muted">{t.inspector.speakersHint}</span>
                <div>
                  {speakers.map((s) => (
                    <div key={s.id} className="speaker-row">
                      <SpeakerTag speaker={s} />
                      <span className="muted">
                        {t.common.cues(
                          cues.filter((c) => c.speakerIds?.includes(s.id))
                            .length,
                        )}
                      </span>
                      <div className="spacer" />
                      <IconButton
                        size="small"
                        type="text"
                        label={t.inspector.rename}
                        disabled={busy}
                        onClick={() => {
                          setSpeakerId(s.id);
                          setSpeakerName(s.name);
                        }}
                        icon={<IconPencil size={16} {...decorative} />}
                      />
                    </div>
                  ))}
                  <div className="speaker-row">
                    <SpeakerTag />
                    <span className="muted">
                      {t.common.cues(
                        cues.filter((c) => !c.speakerIds?.length).length,
                      )}
                    </span>
                  </div>
                </div>
                <div className="speaker-form">
                  <Input
                    size="small"
                    aria-label={t.inspector.speakerId}
                    disabled={busy}
                    value={speakerId}
                    onChange={(e) => setSpeakerId(e.target.value)}
                    placeholder={t.inspector.speakerIdPlaceholder}
                  />
                  <Input
                    size="small"
                    aria-label={t.inspector.displayName}
                    disabled={busy}
                    value={speakerName}
                    onChange={(e) => setSpeakerName(e.target.value)}
                    placeholder={t.inspector.displayNamePlaceholder}
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
                    {t.inspector.saveSpeaker}
                  </Button>
                </div>
              </div>
            )}

            {tab === "suggestions" && (
              <div className="stack">
                <span className="muted">{t.inspector.suggestionsHint}</span>
                {!suggestions.length && (
                  <Empty
                    description={
                      showSample
                        ? t.inspector.noSuggestions
                        : t.inspector.analyzeForSuggestions
                    }
                  />
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

      <div
        className="timeline-dock"
        ref={dockRef}
        style={layout.timeline ? { height: layout.timeline } : undefined}
      >
        <Splitter
          axis="y"
          sign={-1}
          label={t.common.resizeHeight}
          start={() => dockRef.current?.getBoundingClientRect().height ?? 0}
          onResize={resizeTimeline}
          onReset={() => resetLayout("timeline")}
        />
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
                {t.range.label}{" "}
                <span className="mono">
                  {formatSeconds(rangeStart)} — {formatSeconds(rangeEnd)}
                </span>{" "}
                · {t.common.seconds(rangeSeconds)}
              </span>
              <span className="muted">{t.range.perRun}</span>
              <Popover
                trigger="click"
                title={t.range.label}
                content={
                  <div className="range-form">
                    <label>
                      {t.range.start}
                      <InputNumber
                        size="small"
                        controls={numberControls}
                        min={0}
                        value={rangeStart}
                        disabled={busy}
                        onChange={(v) => setRangeStart(v ?? 0)}
                      />
                    </label>
                    <label>
                      {t.range.end}
                      <InputNumber
                        size="small"
                        controls={numberControls}
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
                      {t.range.fromPlayhead}
                    </Button>
                    <p className="muted">{t.range.hint}</p>
                  </div>
                }
              >
                <Button size="small" disabled={busy}>
                  {t.range.adjust}
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
                {t.range.analyze}
              </Button>
            </>
          }
        />
      </div>

      <footer className="statusbar">
        <Popover
          trigger={["hover", "click"]}
          placement="topLeft"
          title={t.status.environment}
          content={
            <div className="env">
              <div>
                <span>FFmpeg</span>
                <Tag color={status?.ffmpeg ? "green" : "orange"}>
                  {status?.ffmpeg ? t.common.ready : t.common.notInstalled}
                </Tag>
              </div>
              <div>
                <span>{status?.provider || t.status.provider}</span>
                <Tag color={status?.apiConfigured ? "green" : "default"}>
                  {status?.apiConfigured
                    ? t.common.configured
                    : t.common.offlineOnly}
                </Tag>
              </div>
              <div>
                <span>yt-dlp</span>
                <Tag color={status?.ytdlp ? "green" : "default"}>
                  {status?.ytdlp ? t.common.ready : t.status.optionalMissing}
                </Tag>
              </div>
              {!status?.apiConfigured && (
                <p className="muted">{t.status.addKeyHint}</p>
              )}
              <div className="rule" />
              <p className="muted">{t.status.privacy}</p>
              <Button
                type="link"
                size="small"
                className="env-link"
                onClick={() => void Editor.OpenSettings()}
              >
                {t.status.openSettings(settingsShortcut)}
              </Button>
            </div>
          }
        >
          <button type="button" className="env-button">
            <span
              className={`dot ${ready ? "ok" : status?.ffmpeg ? "partial" : "warn"}`}
              aria-hidden="true"
            />
            {ready
              ? t.status.allReady
              : status?.ffmpeg
                ? t.status.offline
                : t.status.noFfmpeg}
          </button>
        </Popover>
        {busy && (
          <Space size={6}>
            <Spin size="small" />
            <span>{status?.phase || t.status.working}</span>
            <Button
              danger
              size="small"
              type="text"
              onClick={() => void Editor.Cancel()}
            >
              {t.status.cancel}
            </Button>
          </Space>
        )}
        <div className="spacer" />
        {cue && (
          <span className="mono">
            {t.status.selected(cue.identifier)} · {formatTime(cue.start)} →{" "}
            {formatTime(cue.end)}
          </span>
        )}
      </footer>

      <ImportDialog
        open={importTab !== null}
        tab={importTab ?? "local"}
        onTab={setImportTab}
        onClose={() => setImportTab(null)}
        busy={busy}
        status={status}
        draftDirty={draftDirty}
        onImportMedia={async () => mediaChanged(await update(Editor.ImportVideo))}
        onImportSrt={async () => replaced(await replaceProject(Editor.ImportSRT))}
        onDiscover={(url) => run(() => Editor.DiscoverWeb(url))}
        onImportWeb={async (url, req) => {
          const action = () => Editor.ImportWeb(url, req);
          const next = req.language
            ? await replaceProject(action)
            : await update(action);
          return req.language ? replaced(next) : mediaChanged(next);
        }}
      />

      <Modal
        title={t.inspector.dictionaryAddSelection}
        open={addDictOpen}
        onCancel={() => setAddDictOpen(false)}
        onOk={() =>
          void (async () => {
            try {
              if (addDictMode === "canonical") {
                await Editor.UpsertDictionaryEntry({
                  id: "",
                  canonical: addDictText,
                  category: addDictCategory,
                  variants: [],
                  misspellings: [],
                  original: [],
                  note: "",
                });
              } else {
                const target = dictEntries.find((e) => e.id === addDictTarget);
                if (!target) throw new Error(t.dictionary.pickEntry);
                const variants =
                  addDictMode === "variant"
                    ? [...(target.variants ?? []), addDictText]
                    : (target.variants ?? []);
                const misspellings =
                  addDictMode === "misspelling"
                    ? [...(target.misspellings ?? []), addDictText]
                    : (target.misspellings ?? []);
                await Editor.UpsertDictionaryEntry({
                  ...target,
                  variants,
                  misspellings,
                });
              }
              setAddDictOpen(false);
              void message.success(t.dictionary.saved);
              void refreshDictionaryMatches();
              const v = await Editor.GetDictionary();
              setDictEntries(v.entries ?? []);
            } catch (e) {
              void message.error(errorText(e));
            }
          })()
        }
        okText={t.dictionary.addSelected}
        okButtonProps={{
          disabled:
            !addDictText.trim() ||
            (addDictMode !== "canonical" && !addDictTarget),
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Input value={addDictText} onChange={(e) => setAddDictText(e.target.value)} />
          <Select
            style={{ width: "100%" }}
            value={addDictMode}
            onChange={setAddDictMode}
            options={[
              {
                value: "canonical",
                label: t.dictionary.asCanonical,
              },
              {
                value: "misspelling",
                label: t.dictionary.asMisspelling,
              },
              { value: "variant", label: t.dictionary.asVariant },
            ]}
          />
          {addDictMode === "canonical" ? (
            <Select
              style={{ width: "100%" }}
              value={addDictCategory}
              onChange={setAddDictCategory}
              options={(
                ["person", "nickname", "term", "catchphrase", "other"] as const
              ).map((c) => ({
                value: c,
                label: t.dictionary.categories[c],
              }))}
            />
          ) : (
            <Select
              style={{ width: "100%" }}
              placeholder={t.dictionary.pickEntry}
              value={addDictTarget}
              onChange={setAddDictTarget}
              options={dictEntries.map((e) => ({
                value: e.id,
                label: `${e.canonical} · ${t.dictionary.categories[e.category as keyof typeof t.dictionary.categories] ?? e.category}`,
              }))}
            />
          )}
        </Space>
      </Modal>
    </div>
  );
}

// Each native window loads this bundle and says which one it is.
const windowKind = new URLSearchParams(window.location.search).get("window");
// Wider than the band in which the Wails runtime starts a window resize.
const RESIZE_EDGE = 8;
// Windows keeps a native border and shadow around frameless windows; Linux
// window managers draw none, so the page draws its own edge.
const edged = customChrome && !isWindows;

const ANTD_LOCALES = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "zh-HK": zhHK,
  "en-US": enUS,
};

// Snapshots arrive as fresh objects; compare what an import would change.
function sameProject(
  a: Snapshot["project"] | undefined,
  b: Snapshot["project"] | undefined,
) {
  if (!a || !b) return a === b;
  return (
    a.subtitlePath === b.subtitlePath &&
    (a.undo?.length ?? 0) === (b.undo?.length ?? 0) &&
    JSON.stringify(a.state) === JSON.stringify(b.state)
  );
}

export default function App() {
  const [settings, setSettings] = useSettings();
  const systemDark = useSystemDark();
  // Like the theme, the last language is cached for the first paint.
  const [cachedLocale] = useState(() =>
    initialLocale(
      localStorage.getItem("mousqueau-locale"),
      navigator.languages,
    ),
  );
  const locale: Locale = matchLocale(settings?.locale) ?? cachedLocale;
  const [cachedFont] = useState(
    () => localStorage.getItem("mousqueau-subtitle-font") ?? "",
  );
  const subtitleFont = settings ? settings.subtitleFont : cachedFont;
  const t = messagesFor(locale);
  // Before Go has answered, a window opens in the theme Go put in its URL,
  // else the last theme cached here.
  const [cached] = useState(() =>
    themeChoice(
      new URLSearchParams(window.location.search).get("theme") ??
        localStorage.getItem("mousqueau-theme"),
    ),
  );
  const dark = resolveDark(
    settings ? themeChoice(settings.theme) : cached,
    systemDark,
  );
  useEffect(() => {
    if (!settings) return;
    localStorage.setItem("mousqueau-theme", settings.theme);
    localStorage.setItem("mousqueau-locale", locale);
    localStorage.setItem("mousqueau-subtitle-font", settings.subtitleFont);
  }, [settings, locale]);
  useEffect(() => {
    // A press on a title bar's background moves the window, and one at the
    // edge of a frameless window resizes it; neither may also start a text
    // selection that sweeps across the panes.
    const onDown = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const edge =
        customChrome &&
        Math.min(
          e.clientX,
          e.clientY,
          window.innerWidth - e.clientX,
          window.innerHeight - e.clientY,
        ) < RESIZE_EDGE;
      const titlebar =
        target?.closest(".titlebar, .set-head") &&
        !target.closest("button, input, textarea, a, .ant-select");
      if (edge || titlebar) e.preventDefault();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  useLayoutEffect(() => {
    // WebKit uses the document background outside the page during overscroll.
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.platform = isMac ? "mac" : "desktop";
  }, [dark]);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    // Navigation can finish before React, settings, and the theme are ready.
    // Go reveals this window only after this commit has been painted.
    if (isMac && settings)
      void Events.Emit("window-ready", dark).catch(() => {
        /* The native recovery timeout still permits a failed page to open. */
      });
  }, [settings, dark]);
  return (
    <ConfigProvider
      {...antdIconConfig}
      // Dialogs hold typed input and downloads; only × or Esc closes them.
      modal={{ ...antdIconConfig.modal, mask: { closable: false } }}
      locale={ANTD_LOCALES[locale]}
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: themeColors[dark ? "dark" : "light"].accent,
          colorBgLayout: themeColors[dark ? "dark" : "light"].bg,
          borderRadius: 6,
          colorError: themeColors[dark ? "dark" : "light"].error,
          ...(!dark
            ? {
                green7: themeColors.light["tag-green-text"],
                orange7: themeColors.light["tag-orange-text"],
                gold7: themeColors.light["tag-gold-text"],
              }
            : {}),
        },
      }}
    >
      <I18nProvider value={t}>
        <AntApp>
          <div
            data-theme={dark ? "dark" : "light"}
            className={edged ? "window-edge" : undefined}
            style={
              { "--subtitle-font": fontStack(subtitleFont) } as CSSProperties
            }
          >
            {windowKind === "settings" ? (
              settings && (
                <SettingsWindow
                  settings={settings}
                  onChange={setSettings}
                  dark={dark}
                  systemDark={systemDark}
                />
              )
            ) : windowKind === "welcome" ? (
              settings && (
                <WelcomeWindow
                  settings={settings}
                  onChange={setSettings}
                  systemDark={systemDark}
                />
              )
            ) : windowKind === "dictionary" ? (
              <DictionaryWindow />
            ) : (
              <EditorApp
                dark={dark}
                showSample={showSampleImport(settings?.developer)}
              />
            )}
          </div>
        </AntApp>
      </I18nProvider>
    </ConfigProvider>
  );
}
