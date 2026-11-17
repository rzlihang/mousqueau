import { Button, Empty, Input, Select, Space } from "antd";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Snapshot } from "../bindings/mousqueau/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { type CueFilter } from "./workspace";
import { useT } from "./i18n";
import CueRows from "./CueRows";
import type { Match } from "../bindings/mousqueau/internal/dictionary/models";
import type { RefObject } from "react";
import type {
  Speaker,
  Suggestion,
} from "../bindings/mousqueau/internal/analysis/models";
import type { QualityIssue } from "./quality";

// The cue list: its toolbar with the search and the filter, the column
// heads, and the rows.
export default function CueList({
  active,
  busy,
  cueGridRef,
  cues,
  filter,
  issuesByCue,
  listShown,
  matchesByCue,
  query,
  replaceProject,
  selectCue,
  selected,
  setFilter,
  setQuery,
  showSample,
  shown,
  speakers,
  suggestions,
  todoCount,
}: {
  active: Cue | undefined;
  busy: boolean;
  cueGridRef: RefObject<HTMLElement | null>;
  cues: Cue[];
  filter: CueFilter;
  issuesByCue: ReadonlyMap<string, QualityIssue[]>;
  listShown: boolean;
  matchesByCue: Record<string, Match[]>;
  query: string;
  replaceProject: (action: () => Promise<Snapshot>) => Promise<Snapshot | undefined>;
  selectCue: (next: Cue) => void;
  selected: string;
  setFilter: (filter: CueFilter) => void;
  setQuery: (query: string) => void;
  showSample: boolean;
  shown: Cue[];
  speakers: Speaker[];
  suggestions: Suggestion[];
  todoCount: number;
}) {
  const t = useT();
  return (
    <section
      className={`cue-grid${listShown ? "" : " off"}`}
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
            { value: "quality", label: t.quality.filter },
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
        issuesByCue={issuesByCue}
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
  );
}
