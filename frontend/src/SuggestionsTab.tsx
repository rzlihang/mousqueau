import { Empty } from "antd";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { useT } from "./i18n";
import SuggestionCard from "./SuggestionCard";
import type {
  Speaker,
  Suggestion,
} from "../bindings/mousqueau/internal/analysis/models";
import { type Tab } from "./draft";

// The inspector's Fixes tab: every suggestion, to accept or reject.
export default function SuggestionsTab({
  busy,
  cues,
  decide,
  draftDirty,
  identifierOf,
  selectCue,
  showSample,
  speakers,
  suggestions,
  tab,
}: {
  busy: boolean;
  cues: Cue[];
  decide: (id: string) => (decision: "accepted" | "rejected") => void;
  draftDirty: boolean;
  identifierOf: (cueId: string) => string | undefined;
  selectCue: (next: Cue) => void;
  showSample: boolean;
  speakers: Speaker[];
  suggestions: Suggestion[];
  tab: Tab;
}) {
  const t = useT();
  return (
    <>
      {tab === "suggestions" && (
        <div className="stack">
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
    </>
  );
}
