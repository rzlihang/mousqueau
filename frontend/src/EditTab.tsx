import {
  Button,
  Checkbox,
  Empty,
  Input,
  Select,
  Space,
  Tag,
  Tooltip,
} from "antd";
import { useAntApp } from "./icons";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Snapshot } from "../bindings/mousqueau/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { formatTime } from "./editor";
import { type CueLine, joinUp } from "./cueLines";
import { type CommandId, shortcutOf } from "./keymap";
import { useT } from "./i18n";
import { HighlightedText } from "./dictionaryHighlight";
import SuggestionCard from "./SuggestionCard";
import { issueLimit, readingRate } from "./quality";
import type { Match } from "../bindings/mousqueau/internal/dictionary/models";
import type { ReactNode, RefObject } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { Project } from "../bindings/mousqueau/internal/project/models";
import type {
  Speaker,
  Suggestion,
} from "../bindings/mousqueau/internal/analysis/models";
import type { Pane } from "./layout";
import type { QualityIssue } from "./quality";
import { type Draft, type Tab } from "./draft";

// The inspector's Edit tab: the selected cue's times, speakers, lines,
// dictionary hits and suggestions, with Apply and the cue operations.
export default function EditTab({
  applyDraft,
  assignSelection,
  busy,
  changeDraft,
  changeLines,
  cue,
  cueSuggestions,
  decide,
  discardDraft,
  draft,
  draftDirty,
  draftMatches,
  issuesByCue,
  mergeCues,
  nextCue,
  p,
  paneShown,
  previousCue,
  refreshDictionaryMatches,
  setAddDictMode,
  setAddDictOpen,
  setAddDictTarget,
  setAddDictText,
  showSample,
  speakerOptions,
  speakers,
  splitCue,
  tab,
  textArea,
  textField,
  update,
}: {
  applyDraft: () => Promise<boolean>;
  assignSelection: (speaker?: string) => void;
  busy: boolean;
  changeDraft: (patch: Partial<Draft>) => void;
  changeLines: (lines: CueLine[]) => void;
  cue: Cue | undefined;
  cueSuggestions: Suggestion[];
  decide: (id: string) => (decision: "accepted" | "rejected") => void;
  discardDraft: () => void;
  draft: Draft;
  draftDirty: boolean;
  draftMatches: Match[];
  issuesByCue: ReadonlyMap<string, QualityIssue[]>;
  mergeCues: (first: Cue) => Promise<void>;
  nextCue: Cue | undefined;
  p: Project | null | undefined;
  paneShown: (pane: Pane) => boolean;
  previousCue: Cue | undefined;
  refreshDictionaryMatches: () => Promise<void>;
  setAddDictMode: (mode: "canonical" | "misspelling" | "variant") => void;
  setAddDictOpen: (open: boolean) => void;
  setAddDictTarget: (target: string | undefined) => void;
  setAddDictText: (text: string) => void;
  showSample: boolean;
  speakerOptions: { value: string; label: string }[];
  speakers: Speaker[];
  splitCue: () => void;
  tab: Tab;
  textArea: RefObject<TextAreaRef | null>;
  textField: (inspector: boolean) => ReactNode;
  update: (action: () => Promise<Snapshot>) => Promise<Snapshot | undefined>;
}) {
  const t = useT();
  const { message } = useAntApp();
  return (
    <>
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
                readingRate(cue.text, cue.start, cue.end).toFixed(1),
              )}
            </span>
            {!paneShown("viewer") && (
              <label>
                {t.inspector.text}
                {textField(true)}
              </label>
            )}
            {issuesByCue.get(cue.id)?.map((issue) => (
              <span key={issue} className="quality-issue">
                {issue === "overlap"
                  ? t.quality.details.overlap
                  : t.quality.details[issue](issueLimit(issue, cue.text))}
              </span>
            ))}
            {!!draftMatches.length && (
              <p className="dict-preview muted small">
                <HighlightedText
                  text={draft.text}
                  matches={draftMatches}
                />
              </p>
            )}
            {draft.lines ? (
              <div className="field">
                {t.inspector.lines}
                {draft.lines.map((line, i) => (
                  <div key={i} className="cue-line">
                    <span
                      className="cue-line-mark"
                      aria-hidden="true"
                      style={{
                        background:
                          speakers.find(
                            (s) => s.id === line.speakerIds[0],
                          )?.color ?? "var(--line)",
                      }}
                    />
                    <span className="cue-line-text" title={line.text}>
                      {line.text}
                    </span>
                    <Select
                      mode="multiple"
                      size="small"
                      className="cue-line-speakers"
                      disabled={busy}
                      aria-label={t.inspector.lineSpeaker(i + 1)}
                      placeholder={t.inspector.unassignedShort}
                      maxTagCount="responsive"
                      value={line.speakerIds}
                      options={speakerOptions}
                      onChange={(speakerIds) =>
                        changeLines(
                          draft.lines!.map((l, k) =>
                            k === i ? { ...l, speakerIds } : l,
                          ),
                        )
                      }
                    />
                    {i > 0 && (
                      <Button
                        size="small"
                        type="text"
                        disabled={busy}
                        onClick={() =>
                          changeLines(joinUp(draft.lines!, i))
                        }
                      >
                        {t.inspector.joinLine}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
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
            )}
            <div className="assign-row">
              <span className="muted small">
                {t.inspector.assignSelection}
              </span>
              <Space size={4} wrap>
                {speakers.map((s, i) => (
                  <Button
                    key={s.id}
                    size="small"
                    disabled={busy}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => assignSelection(s.id)}
                  >
                    <span
                      className="speaker-dot"
                      aria-hidden="true"
                      style={{ background: s.color }}
                    />
                    {s.name}
                    {i < 9 && (
                      <kbd className="muted">
                        {shortcutOf(`speaker${i + 1}` as CommandId)}
                      </kbd>
                    )}
                  </Button>
                ))}
                <Button
                  size="small"
                  disabled={busy}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => assignSelection()}
                >
                  {t.inspector.unassignedShort}
                  <kbd className="muted">{shortcutOf("speaker0")}</kbd>
                </Button>
              </Space>
            </div>
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
              {cue.lines && cue.lines.length > 1 ? (
                <Tooltip title={t.inspector.splitLinesHint}>
                  <Button
                    size="small"
                    disabled={busy || draftDirty}
                    onClick={() =>
                      void update(() => Editor.SplitCueLines(cue.id))
                    }
                  >
                    {t.inspector.splitLines(cue.lines.length)}
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title={t.inspector.splitHint}>
                  <Button
                    size="small"
                    disabled={busy || draftDirty}
                    onClick={splitCue}
                  >
                    {t.inspector.split}
                  </Button>
                </Tooltip>
              )}
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
    </>
  );
}
