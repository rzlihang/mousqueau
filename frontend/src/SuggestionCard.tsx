import { Button, Space, Tag } from "antd";
import type {
  Speaker,
  Suggestion,
} from "../bindings/mousqueau/internal/analysis/models";
import { changedText } from "./editor";

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
  if (!speaker) return <Tag className="speaker-tag">Unknown</Tag>;
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
  const locked = busy || s.status !== "pending" || draftDirty;
  const diff = changedText(s.original, s.proposed);
  return (
    <article className={`suggestion ${s.status}`}>
      <div className="section-heading">
        <strong>字幕 #{cueIdentifier}</strong>
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
          <label>音频转录建议</label>
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
      <p className="muted">
        {s.review
          ? "多人、重叠或跨句／范围边界：请对照音频确认文字与时间。"
          : "以音频转录为依据，请确认忠实度与繁体用字。"}
      </p>
      <Space wrap>
        <Button
          size="small"
          disabled={locked}
          type="primary"
          onClick={() => onDecide("accepted")}
        >
          {s.review ? "确认后接受" : "接受"}
        </Button>
        <Button
          size="small"
          disabled={locked}
          onClick={() => onDecide("rejected")}
        >
          拒绝
        </Button>
        {onLocate && (
          <Button size="small" disabled={busy} onClick={onLocate}>
            定位字幕
          </Button>
        )}
      </Space>
    </article>
  );
}
