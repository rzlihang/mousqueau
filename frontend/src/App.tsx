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
  Button,
  ConfigProvider,
  Input,
  InputNumber,
  Modal,
  Popover,
  Segmented,
  Select,
  Space,
  theme,
} from "antd";
import {
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
import { Events } from "@wailsio/runtime";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Snapshot, Status } from "../bindings/mousqueau/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { activeCue, formatTime, parseTime } from "./editor";
import {
  type CueLine,
  extract,
  lineSpeakers,
  relines,
  renderLines,
  survivingSpeakers,
} from "./cueLines";
import {
  bindKeymap,
  type CommandId,
  lastRun,
  type Handlers,
  shortcutOf,
} from "./keymap";
import ReplaceDialog from "./ReplaceDialog";
import ShiftDialog from "./ShiftDialog";
import ShortcutsDialog from "./ShortcutsDialog";
import type { ZoomRequest } from "./Timeline";
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
import jaJP from "antd/locale/ja_JP";
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
  mixHex,
  resolveDark,
  textOnAccent,
  themeChoice,
} from "./preferences";
import SettingsWindow from "./SettingsWindow";
import DictionaryWindow from "./DictionaryWindow";
import { timelineSize, viewerSize } from "./layout";
import { qualityIssues } from "./quality";
import { type Draft, EMPTY_DRAFT, type Tab, draftOf } from "./draft";
import CueList from "./CueList";
import EditTab from "./EditTab";
import SpeakersTab from "./SpeakersTab";
import SuggestionsTab from "./SuggestionsTab";
import Splitter from "./Splitter";
import StatusBar from "./StatusBar";
import Timeline from "./Timeline";
import TitleBar from "./TitleBar";
import { usePaneLayout } from "./usePaneLayout";
import {
  customChrome,
  isMac,
  isWindows,
  useDesktopLook,
  useSettings,
  useSystemDark,
} from "./useSettings";
import WelcomeWindow from "./WelcomeWindow";
import { showSampleImport } from "./sampleImport";
import type { Entry, Match } from "../bindings/mousqueau/internal/dictionary/models";
import "./style.css";

type Wave =
  | { url: string; peaks: number[]; rate: number }
  | { url: string; error: string }
  | null;
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];


function EditorApp({
  dark,
  accent,
  showSample,
}: {
  dark: boolean;
  accent: string;
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
  const [importTab, setImportTab] = useState<ImportTab | null>(null);
  const [overlayEditing, setOverlayEditing] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [zoomRequest, setZoomRequest] = useState<ZoomRequest>();
  const [speakerId, setSpeakerId] = useState("A");
  const [speakerName, setSpeakerName] = useState("");
  const panes = usePaneLayout();
  const {
    layout,
    mode,
    stacked,
    paneShown,
    listOpen,
    setListOpen,
    listShown,
    inspectorOpen,
    widthOf,
    resizeColumn,
    resizeViewer,
    resizeTimeline,
  } = panes;
  const { upperRef, cueGridRef, viewerRef, inspectorRef, dockRef } = panes.refs;
  const resetLayout = panes.reset;
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
  const issuesByCue = useMemo(() => qualityIssues(cues), [cues]);
  const shown = useMemo(
    () =>
      filterCues(cues, suggestions, query, filter, dictIssueIds, issuesByCue),
    [cues, suggestions, query, filter, dictIssueIds, issuesByCue],
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
      .catch((e) => message.error(errorText(e)))
      .then(offerRecovery);
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
    setDraft(cue ? draftOf(cue) : EMPTY_DRAFT);
    setDraftDirty(false);
  }, [cue]);
  // Focus waits until the viewer shows the selected cue's text field, which
  // may take a seek after the selection itself.
  useEffect(() => {
    if (focusOverlay.current && cue && overlayCue?.id === cue.id) {
      focusOverlay.current = false;
      textArea.current?.focus();
    }
  }, [cue?.id, overlayCue?.id]);
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
  // Unsaved work an earlier session left behind is offered once, at launch.
  // The dialog takes an answer either way: until then Go keeps the file.
  async function offerRecovery() {
    const found = await Editor.RecoveryInfo().catch(() => null);
    if (!found?.available) return;
    modal.confirm({
      title: t.recovery.title,
      content: t.recovery.content(
        // <html lang> carries the interface language.
        new Date(found.savedAt).toLocaleString(
          document.documentElement.lang || undefined,
        ),
        found.cues,
      ),
      okText: t.recovery.restore,
      cancelText: t.recovery.discard,
      closable: false,
      keyboard: false,
      maskClosable: false,
      onOk: async () => {
        try {
          const restored = await Editor.RestoreRecovery();
          setSnapshot(restored);
          setSelected(restored.project?.state.cues?.[0]?.id ?? "");
          setDraftDirty(false);
          setDirty(true);
        } catch (e) {
          void message.error(errorText(e));
        }
      },
      onCancel: () =>
        void Editor.DiscardRecovery().catch((e) =>
          message.error(errorText(e)),
        ),
    });
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
      // Blank rows typed in the viewer are not lines; one line left is an
      // ordinary cue.
      const lines = draft.lines?.filter((l) => l.text.trim()) ?? null;
      const plain = lines && lines.length < 2 ? lines[0] : undefined;
      const edited: Cue = {
        ...cue,
        text: plain ? plain.text : lines ? renderLines(lines) : draft.text,
        start: parseTime(draft.start, t.editor.invalidTime),
        end: parseTime(draft.end, t.editor.invalidTime),
        speakerIds: plain
          ? plain.speakerIds
          : lines
            ? lineSpeakers(lines)
            : draft.speakerIds,
        review: draft.review,
        lines: lines && lines.length > 1 ? lines : null,
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
    setDraft(draftOf(cue));
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
  function nudge(seconds: number) {
    if (!mediaUrl) return false;
    const end = mediaDuration || duration;
    seek(Math.min(end, Math.max(0, playhead + seconds)));
  }
  function setSpeed(value: number) {
    setRate(value);
    if (video.current) video.current.playbackRate = value;
  }
  function stepRate(delta: number) {
    const next = RATES[RATES.indexOf(rate) + delta];
    if (next === undefined) return false;
    setSpeed(next);
  }
  // Puts the text cursor in the selected cue's text: the viewer subtitle, or
  // the inspector's field while the viewer is hidden.
  function editText() {
    if (!paneShown("viewer")) {
      if (!cue) return;
      panes.reveal("inspector");
      setListOpen(false);
      setTab("edit");
      setTimeout(() => textArea.current?.focus({ cursor: "end" }));
      return;
    }
    const el = textArea.current?.resizableTextArea?.textArea;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    } else if (cue) {
      focusOverlay.current = true;
      setTab("edit");
      seek(cue.start);
    }
  }
  // ⌃⌥n: with words selected in the viewer, moves them to a line for the
  // nth speaker; otherwise sets the speaker of the line the cursor is in,
  // or toggles the speaker on the cue. 0 means no speaker.
  function assignSpeaker(n: number) {
    if (!cue || busy) return false;
    const speaker = n ? speakers[n - 1] : undefined;
    if (n && !speaker) return false;
    const el = textArea.current?.resizableTextArea?.textArea;
    if (el && el.selectionEnd > el.selectionStart) {
      assignSelection(speaker?.id);
      return;
    }
    const ids = speaker ? [speaker.id] : [];
    if (draft.lines) {
      if (!el || document.activeElement !== el) {
        void message.info(t.inspector.assignNeedsLine);
        return;
      }
      const row = draft.text.slice(0, el.selectionStart).split("\n").length - 1;
      const line = draft.lines[row];
      if (!line) return false;
      const same = !!speaker && line.speakerIds.length === 1 && line.speakerIds[0] === speaker.id;
      changeLines(
        draft.lines.map((l, i) => (i === row ? { ...l, speakerIds: same ? [] : ids } : l)),
      );
      return;
    }
    if (!speaker) changeDraft({ speakerIds: [] });
    else
      changeDraft({
        speakerIds: draft.speakerIds.includes(speaker.id)
          ? draft.speakerIds.filter((id) => id !== speaker.id)
          : [...draft.speakerIds, speaker.id],
      });
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
  function changeDraft(patch: Partial<Draft>) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      // Typing in the viewer keeps each row's speakers; one row left is an
      // ordinary cue again, spoken by everyone the lines had.
      if (patch.text !== undefined && d.lines && patch.lines === undefined) {
        next.lines = relines(patch.text, d.lines);
        if (!next.lines)
          next.speakerIds = survivingSpeakers(patch.text, d.lines);
      }
      return next;
    });
    setDraftDirty(true);
  }
  function changeLines(lines: CueLine[]) {
    if (lines.length > 1) changeDraft({ lines, text: renderLines(lines) });
    else
      changeDraft({
        lines: null,
        text: lines[0]?.text ?? "",
        speakerIds: lines[0]?.speakerIds ?? [],
      });
  }
  // Moves the text selected in the viewer to a new line for speaker.
  function assignSelection(speaker?: string) {
    const el = textArea.current?.resizableTextArea?.textArea;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    if (!el || end <= start) {
      void message.info(t.inspector.assignNeedsSelection);
      return;
    }
    const result = extract(
      draft.text,
      draft.lines,
      draft.speakerIds,
      start,
      end,
      speaker,
    );
    if ("error" in result) {
      void message.info(
        result.error === "acrossLines"
          ? t.inspector.assignAcrossLines
          : result.error === "sameSpeaker"
            ? t.inspector.assignSameSpeaker
            : t.inspector.assignNeedsSelection,
      );
      return;
    }
    changeLines(result.lines);
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
  const canShift = !busy && !draftDirty && !!cues.length;
  // Keyboard shortcuts (keymap.ts). A handler returning false did nothing,
  // so the key keeps its usual effect.
  // The selected cue's text field. It lives in the viewer, as the subtitle
  // itself, and moves to the inspector while the viewer is hidden; there is
  // only ever one, so the cursor commands always read the same field.
  const textField = (inspector: boolean) => (
    <Input.TextArea
      ref={textArea}
      className={inspector ? "subtitle-text" : "subtitle-text subtitle-edit"}
      variant={inspector ? "outlined" : "borderless"}
      disabled={busy}
      autoSize={inspector ? { minRows: 2 } : true}
      aria-label={t.inspector.text}
      title={inspector ? undefined : t.viewer.clickToEdit}
      placeholder={t.viewer.textPlaceholder}
      value={draft.text}
      onFocus={() => {
        video.current?.pause();
        setTab("edit");
        setOverlayEditing(true);
      }}
      onBlur={() => setOverlayEditing(false)}
      onKeyDown={(e) => {
        // Esc leaves the text, keeping the draft, so the
        // single-key shortcuts work again.
        if (e.key === "Escape") e.currentTarget.blur();
      }}
      onChange={(e) => changeDraft({ text: e.target.value })}
    />
  );
  const inspectorTabs = [
    { label: t.inspector.edit, value: "edit" },
    { label: t.inspector.speakers, value: "speakers" },
    {
      label: `${t.inspector.suggestions}${pendingCount ? ` ${pendingCount}` : ""}`,
      value: "suggestions",
    },
  ];
  const keyHandlers = useRef<Handlers>({});
  keyHandlers.current = {
    openProject: () => !busy && void replaceProject(Editor.OpenProject),
    saveProject: () => !busy && !!p && void save(false),
    import: () => !busy && void setImportTab("local"),
    exportSrt: () => !busy && !!p && void save(true),
    shiftCues: () => canShift && setShiftOpen(true),
    findReplace: () => canShift && setReplaceOpen(true),
    settings: () => void Editor.OpenSettings(),
    dictionary: () => void Editor.OpenDictionary(),
    shortcuts: () => setShortcutsOpen(true),
    undo: () => canUndo && void update(Editor.Undo),
    redo: () => canRedo && void update(Editor.Redo),
    playPause: () => !!mediaUrl && togglePlay(),
    pause: () => void video.current?.pause(),
    back1: () => nudge(-1),
    forward1: () => nudge(1),
    back2: () => nudge(-2),
    forward2: () => nudge(2),
    back10: () => nudge(-10),
    forward10: () => nudge(10),
    slower: () => stepRate(-1),
    faster: () => stepRate(1),
    replay: () => {
      if (!cue || !mediaUrl) return false;
      seek(cue.start);
      void video.current?.play().catch(() => undefined);
    },
    previousCue: () => !!cues.length && stepCue(-1),
    nextCue: () => !!cues.length && stepCue(1),
    editText: () => !!cue && editText(),
    applyEdit: () => draftDirty && !busy && void applyDraft(),
    setStart: () => !!cue && changeDraft({ start: formatTime(playhead) }),
    setEnd: () => !!cue && changeDraft({ end: formatTime(playhead) }),
    split: () => {
      if (!cue || busy || draftDirty) return false;
      if (cue.lines && cue.lines.length > 1)
        void update(() => Editor.SplitCueLines(cue.id));
      else splitCue();
    },
    mergeNext: () =>
      !!cue && !!nextCue && !busy && !draftDirty && void mergeCues(cue),
    mergePrevious: () =>
      !!previousCue && !busy && !draftDirty && void mergeCues(previousCue),
    toggleReview: () => !!cue && changeDraft({ review: !draft.review }),
    zoomIn: () => setZoomRequest((z) => ({ kind: "in", n: (z?.n ?? 0) + 1 })),
    zoomOut: () =>
      setZoomRequest((z) => ({ kind: "out", n: (z?.n ?? 0) + 1 })),
    zoomToCue: () =>
      !!cue && setZoomRequest((z) => ({ kind: "cue", n: (z?.n ?? 0) + 1 })),
  };
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0])
    keyHandlers.current[`speaker${n}` as CommandId] = () => assignSpeaker(n);
  useEffect(() => bindKeymap(keyHandlers), []);
  // The macOS menu bar sends its commands as events. A key the page took
  // does not reach the menu; should one ever arrive too, it runs once.
  useEffect(
    () =>
      Events.On("command", (e) => {
        const id = String(e.data) as CommandId;
        if (lastRun.id === id && performance.now() - lastRun.at < 300) return;
        keyHandlers.current[id]?.();
      }),
    [],
  );

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
      data-layout={mode}
      data-hide={panes.hidden.join(" ")}
    >
      <TitleBar
        name={projectName}
        summary={
          p
            ? `${dirty || draftDirty ? t.editor.edited : t.editor.unchanged} · ${t.common.cues(cues.length)} · ${t.editor.speakerCount(speakers.length)}`
            : undefined
        }
        unsaved={dirty || draftDirty}
        hasProject={!!p}
        busy={busy}
        draftDirty={draftDirty}
        showSample={showSample}
        canUndo={canUndo}
        canRedo={canRedo}
        canShift={canShift}
        replaceProject={replaceProject}
        save={save}
        update={update}
        run={run}
        setImportTab={setImportTab}
        setShiftOpen={setShiftOpen}
        setReplaceOpen={setReplaceOpen}
        setShortcutsOpen={setShortcutsOpen}
      />

      <div
        className="upper"
        ref={upperRef}
        style={panes.upperStyle}
      >
        {stacked && paneShown("inspector") && (
          <div className="work-tabs">
            <Segmented
              block
              size="small"
              value={listOpen ? "cues" : tab}
              onChange={(v) => {
                setListOpen(v === "cues");
                if (v !== "cues") setTab(v as Tab);
              }}
              options={[
                { label: t.cueList.title, value: "cues" },
                ...inspectorTabs,
              ]}
            />
          </div>
        )}
        <CueList
          active={active}
          busy={busy}
          cueGridRef={cueGridRef}
          cues={cues}
          filter={filter}
          issuesByCue={issuesByCue}
          listShown={listShown}
          matchesByCue={matchesByCue}
          query={query}
          replaceProject={replaceProject}
          selectCue={selectCue}
          selected={selected}
          setFilter={setFilter}
          setQuery={setQuery}
          showSample={showSample}
          shown={shown}
          speakers={speakers}
          suggestions={suggestions}
          todoCount={todoCount}
        />

        <section className="viewer" ref={viewerRef} aria-label={t.viewer.label}>
          {mode === "wide" ? (
            <Splitter
              axis="x"
              sign={1}
              label={t.common.resizeWidth}
              start={() => widthOf(cueGridRef.current)}
              onResize={(size) => resizeColumn("left", size)}
              onReset={() => resetLayout("left")}
            />
          ) : (
            <Splitter
              end
              axis={mode === "compact" ? "x" : "y"}
              sign={1}
              label={
                mode === "compact" ? t.common.resizeWidth : t.common.resizeHeight
              }
              start={() => {
                const box = viewerRef.current?.getBoundingClientRect();
                return (mode === "compact" ? box?.width : box?.height) ?? 0;
              }}
              onResize={resizeViewer}
              onReset={() => resetLayout(viewerSize(mode))}
            />
          )}
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
                  onError={() => {
                    // A media error can stop playback without a pause event.
                    setPlaying(false);
                    void message.error(t.viewer.mediaError);
                  }}
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
                  paneShown("viewer") && textField(false)
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
                tooltip={t.editor.withShortcut(
                  t.viewer.previous,
                  shortcutOf("previousCue"),
                )}
                icon={<IconPlayerSkipBack size={18} {...decorative} />}
                disabled={busy || !cues.length}
                onClick={() => stepCue(-1)}
              />
              <IconButton
                label={playing ? t.viewer.pause : t.viewer.play}
                tooltip={t.editor.withShortcut(
                  playing ? t.viewer.pause : t.viewer.play,
                  shortcutOf("playPause"),
                )}
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
                tooltip={t.editor.withShortcut(
                  t.viewer.next,
                  shortcutOf("nextCue"),
                )}
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
              onChange={setSpeed}
              options={RATES.map((v) => ({
                value: v,
                label: `${v.toFixed(v % 0.5 ? 2 : 1)}×`,
              }))}
            />
          </div>
        </section>

        <aside
          className={`inspector${inspectorOpen ? "" : " off"}`}
          ref={inspectorRef}
          aria-label={t.inspector.label}
        >
          {!stacked && (
            <>
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
                  options={inspectorTabs}
                />
              </div>
            </>
          )}
          <div className="inspector-body" key={tab}>
            <EditTab
              applyDraft={applyDraft}
              assignSelection={assignSelection}
              busy={busy}
              changeDraft={changeDraft}
              changeLines={changeLines}
              cue={cue}
              cueSuggestions={cueSuggestions}
              decide={decide}
              discardDraft={discardDraft}
              draft={draft}
              draftDirty={draftDirty}
              draftMatches={draftMatches}
              issuesByCue={issuesByCue}
              mergeCues={mergeCues}
              nextCue={nextCue}
              p={p}
              paneShown={paneShown}
              previousCue={previousCue}
              refreshDictionaryMatches={refreshDictionaryMatches}
              setAddDictMode={setAddDictMode}
              setAddDictOpen={setAddDictOpen}
              setAddDictTarget={setAddDictTarget}
              setAddDictText={setAddDictText}
              showSample={showSample}
              speakerOptions={speakerOptions}
              speakers={speakers}
              splitCue={splitCue}
              tab={tab}
              textArea={textArea}
              textField={textField}
              update={update}
            />
            <SpeakersTab
              speakerId={speakerId}
              setSpeakerId={setSpeakerId}
              speakerName={speakerName}
              setSpeakerName={setSpeakerName}
              busy={busy}
              cues={cues}
              draftDirty={draftDirty}
              p={p}
              speakers={speakers}
              tab={tab}
              update={update}
            />
            <SuggestionsTab
              busy={busy}
              cues={cues}
              decide={decide}
              draftDirty={draftDirty}
              identifierOf={identifierOf}
              selectCue={selectCue}
              showSample={showSample}
              speakers={speakers}
              suggestions={suggestions}
              tab={tab}
            />
          </div>
        </aside>
      </div>

      <div
        className="timeline-dock"
        ref={dockRef}
        style={
          layout[timelineSize(mode)]
            ? { height: layout[timelineSize(mode)] }
            : undefined
        }
      >
        <Splitter
          axis="y"
          sign={-1}
          label={t.common.resizeHeight}
          start={() => dockRef.current?.getBoundingClientRect().height ?? 0}
          onResize={resizeTimeline}
          onReset={() => resetLayout(timelineSize(mode))}
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
          accent={accent}
          busy={busy}
          onSeek={seek}
          onSelectCue={selectCue}
          onRangeChange={setRange}
          zoomRequest={zoomRequest}
          actions={
            <>
              <span className={rangeValid ? "" : "range-invalid"}>
                {t.range.label}{" "}
                <span className="mono">
                  {formatSeconds(rangeStart)} — {formatSeconds(rangeEnd)}
                </span>{" "}
                · {t.common.seconds(rangeSeconds)}
              </span>
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

      <StatusBar
        status={status}
        busy={busy}
        cue={cue}
        hidden={panes.hidden}
        onTogglePane={panes.toggle}
      />

      <ShortcutsDialog
        open={shortcutsOpen}
        speakers={speakers}
        onClose={() => setShortcutsOpen(false)}
      />
      <ShiftDialog
        open={shiftOpen}
        busy={busy}
        reference={cue ?? cues[0]}
        playhead={cue && mediaUrl ? playhead : undefined}
        onClose={() => setShiftOpen(false)}
        onShift={async (seconds) => !!(await update(() => Editor.ShiftCues(seconds)))}
      />
      <ReplaceDialog
        open={replaceOpen}
        busy={busy}
        cues={cues}
        initial={query}
        onClose={() => setReplaceOpen(false)}
        onReplace={async (find, replacement, matchCase, matches) => {
          if (!(await update(() => Editor.ReplaceText(find, replacement, matchCase))))
            return false;
          void message.success(t.replace.done(matches));
          return true;
        }}
      />
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
  "ja-JP": jaJP,
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
  const mediaDark = useSystemDark();
  const look = useDesktopLook();
  // On Omarchy the System theme follows the desktop theme's own mode.
  const systemDark = look.mode ? look.mode === "dark" : mediaDark;
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
  const accent = look.accent || themeColors[dark ? "dark" : "light"].accent;
  const radius = look.present ? look.radius : 6;
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
  // A desktop accent also tints selections and the waveform, which are
  // otherwise shades of the app's own blue.
  const lookVars = {
    "--accent": accent,
    "--radius": `${radius}px`,
    ...(look.accent
      ? {
          "--wave-sel": accent,
          "--wave": mixHex(accent, themeColors[dark ? "dark" : "light"].panel, 0.45),
          "--select": mixHex(accent, themeColors[dark ? "dark" : "light"].panel, 0.16),
        }
      : {}),
  };
  useLayoutEffect(() => {
    // Popups are portalled outside the themed root, so they read the root's.
    const root = document.documentElement.style;
    for (const name of ["--wave-sel", "--wave", "--select"])
      root.removeProperty(name);
    for (const [name, value] of Object.entries(lookVars))
      root.setProperty(name, value);
  }, [accent, radius, look.accent, dark]);
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
          colorPrimary: accent,
          colorTextLightSolid: textOnAccent(accent),
          colorBgLayout: themeColors[dark ? "dark" : "light"].bg,
          // Corners match the windows around it: square on Omarchy's default.
          borderRadius: radius,
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
              {
                "--subtitle-font": fontStack(subtitleFont),
                ...lookVars,
              } as CSSProperties
            }
          >
            {windowKind === "settings" ? (
              settings && (
                <SettingsWindow
                  settings={settings}
                  onChange={setSettings}
                />
              )
            ) : windowKind === "welcome" ? (
              settings && (
                <WelcomeWindow
                  settings={settings}
                  onChange={setSettings}
                />
              )
            ) : windowKind === "dictionary" ? (
              <DictionaryWindow />
            ) : (
              <EditorApp
                dark={dark}
                accent={accent}
                showSample={showSampleImport(settings?.developer)}
              />
            )}
          </div>
        </AntApp>
      </I18nProvider>
    </ConfigProvider>
  );
}
