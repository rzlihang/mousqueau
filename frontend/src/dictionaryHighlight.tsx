import type { ReactNode } from "react";
import type { Match } from "../bindings/mousqueau/internal/dictionary/models";

/** Render cue text with dictionary hits (code-point offsets from Go). */
export function HighlightedText({
  text,
  matches,
}: {
  text: string;
  matches: Match[] | null | undefined;
}) {
  const runes = Array.from(text);
  if (!matches?.length) return <>{text}</>;
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((m, i) => {
    if (m.start < cursor || m.end > runes.length) return;
    if (m.start > cursor) {
      parts.push(
        <span key={`t-${i}-${cursor}`}>
          {runes.slice(cursor, m.start).join("")}
        </span>,
      );
    }
    const cls =
      m.kind === "misspelled" ? "dict-misspelled" : "dict-known";
    const title = [
      m.kind === "misspelled" ? `→ ${m.canonical}` : m.canonical,
      m.category,
      m.personName ? `→ ${m.personName}` : "",
      m.note,
    ]
      .filter(Boolean)
      .join(" · ");
    parts.push(
      <span key={`m-${i}-${m.start}`} className={cls} title={title}>
        {runes.slice(m.start, m.end).join("")}
      </span>,
    );
    cursor = m.end;
  });
  if (cursor < runes.length) {
    parts.push(<span key="tail">{runes.slice(cursor).join("")}</span>);
  }
  return <>{parts}</>;
}
