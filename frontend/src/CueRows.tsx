import { type ReactNode, useEffect, useRef, useState } from "react";
import { Tag } from "antd";
import type {
  Speaker,
  Suggestion,
} from "../bindings/mousqueau/internal/analysis/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { formatTime } from "./editor";
import { useT } from "./i18n";
import { SpeakerTags } from "./SuggestionCard";
import { cueStatus, rowWindow } from "./workspace";

// Matches .cue-row's height in style.css.
const ROW = 32;

type Props = {
  cues: Cue[];
  speakers: Speaker[];
  suggestions: Suggestion[];
  selectedId: string;
  activeId: string;
  busy: boolean;
  onSelect: (cue: Cue) => void;
  children?: ReactNode;
};

// The cue list renders only the rows in view, so long episodes stay cheap.
export default function CueRows(props: Props) {
  const { cues, speakers, suggestions, selectedId, activeId, busy } = props;
  const t = useT();
  const body = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    setHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);
  // Bring the selected row into view, as scrollIntoView with block "nearest".
  useEffect(() => {
    const el = body.current;
    const index = cues.findIndex((c) => c.id === selectedId);
    if (!el || index < 0) return;
    const top = index * ROW;
    if (top < el.scrollTop) el.scrollTo({ top, behavior: "smooth" });
    else if (top + ROW > el.scrollTop + el.clientHeight)
      el.scrollTo({ top: top + ROW - el.clientHeight, behavior: "smooth" });
  }, [selectedId]);

  const [first, last] = rowWindow(scrollTop, height, ROW, cues.length);
  return (
    <div
      className="grid-body"
      ref={body}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      {props.children}
      {!!cues.length && (
        <div className="grid-rows" style={{ height: cues.length * ROW }}>
          {cues.slice(first, last).map((c, k) => {
            const st = cueStatus(c, suggestions);
            return (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                aria-pressed={selectedId === c.id}
                className={`cue-row cue-columns${selectedId === c.id ? " selected" : ""}${activeId === c.id ? " playing" : ""}`}
                style={{ top: (first + k) * ROW }}
                onClick={() => props.onSelect(c)}
              >
                <span className="mono muted small">{c.identifier}</span>
                <span className="mono">{formatTime(c.start)}</span>
                <span className="mono muted small">
                  {t.common.seconds((c.end - c.start).toFixed(1))}
                </span>
                <span className="tag-row">
                  <SpeakerTags ids={c.speakerIds} speakers={speakers} />
                </span>
                <span className="row-text">{c.text}</span>
                <span>
                  {st && (
                    <Tag color={st === "review" ? "orange" : "blue"}>
                      {st === "review"
                        ? t.cueList.review
                        : t.common.pendingDecision}
                    </Tag>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
