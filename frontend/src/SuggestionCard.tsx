import { Button, Space, Tag } from "antd";
import type {
  Speaker,
  Suggestion,
} from "../bindings/mousqueau/internal/analysis/models";
import { changedText } from "./editor";
import { useT } from "./i18n";

type Props = {
  suggestion: Suggestion;
  cueIdentifier?: string;
  speakers: Speaker[];
  busy: boolean;
  draftDirty: boolean;
  onDecide: (decision: "accepted" | "rejected") => void;
  onLocate?: () => void;
};

export function SpeakerTag({ speaker }: { speaker?: Speaker }) {
  const t = useT();
  if (!speaker)
    return <Tag className="speaker-tag">{t.common.unknownSpeaker}</Tag>;
  return (
    <Tag className="speaker-tag" color={speaker.color || "default"}>
      {speaker.name || speaker.id}
    </Tag>
  );
}

export function SpeakerTags({
  ids,
  speakers,
}: {
  ids: string[] | null;
  speakers: Speaker[];
}) {
  if (!ids?.length) return <SpeakerTag />;
  return (
    <>
      {ids.map((id) => (
        <SpeakerTag
          key={id}
          speaker={
            speakers.find((s) => s.id === id) ?? { id, name: id, color: "" }
          }
        />
      ))}
    </>
  );
}

export default function SuggestionCard({
  suggestion: s,
  cueIdentifier,
  speakers,
  busy,
  draftDirty,
  onDecide,
  onLocate,
}: Props) {
  const t = useT();
  const locked = busy || s.status !== "pending" || draftDirty;
  const diff = changedText(s.original, s.proposed);
  return (
    <article className={`suggestion ${s.status}`}>
      <div className="section-heading">
        <strong>{t.suggestion.cue(cueIdentifier ?? "")}</strong>
        <Tag>
          {s.source === "dictionary"
            ? t.dictionary.sourceDictionary
            : t.dictionary.sourceAudio}
        </Tag>
        <Tag color={s.review ? "orange" : "blue"}>
          {s.status !== "pending"
            ? s.status === "accepted"
              ? t.suggestion.accepted
              : t.suggestion.rejected
            : s.review
              ? t.common.pendingReview
              : t.common.pendingDecision}
        </Tag>
      </div>
      <div className="comparison">
        <div>
          <label>{t.suggestion.original}</label>
          <p>
            {diff
              .filter((d) => !d.added)
              .map((d, i) => (
                <span key={i} className={d.removed ? "removed" : ""}>
                  {d.value}
                </span>
              ))}
          </p>
        </div>
        <div>
          <label>{t.suggestion.proposed}</label>
          <p>
            {diff
              .filter((d) => !d.removed)
              .map((d, i) => (
                <span key={i} className={d.added ? "added" : ""}>
                  {d.value}
                </span>
              ))}
          </p>
        </div>
      </div>
      {!!s.speakerIds?.length && (
        <div className="tag-row">
          <SpeakerTags ids={s.speakerIds} speakers={speakers} />
        </div>
      )}
      {s.review && s.source !== "dictionary" && (
        <p className="muted">{t.suggestion.reviewHint}</p>
      )}
      <Space wrap>
        <Button
          size="small"
          disabled={locked}
          type="primary"
          onClick={() => onDecide("accepted")}
        >
          {s.review ? t.suggestion.acceptReviewed : t.suggestion.accept}
        </Button>
        <Button
          size="small"
          disabled={locked}
          onClick={() => onDecide("rejected")}
        >
          {t.suggestion.reject}
        </Button>
        {onLocate && (
          <Button size="small" disabled={busy} onClick={onLocate}>
            {t.suggestion.locate}
          </Button>
        )}
      </Space>
    </article>
  );
}
