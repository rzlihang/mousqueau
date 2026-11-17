import { useState } from "react";
import { Button, Input } from "antd";
import { IconPencil } from "@tabler/icons-react";
import IconButton from "./IconButton";
import { decorative } from "./icons";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Snapshot } from "../bindings/mousqueau/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { useT } from "./i18n";
import { SpeakerTag } from "./SuggestionCard";
import type { Project } from "../bindings/mousqueau/internal/project/models";
import type { Speaker } from "../bindings/mousqueau/internal/analysis/models";
import { type Tab } from "./draft";
const colors = ["#1677ff", "#52c41a", "#d46b08"];

// The inspector's Speakers tab: rename a speaker or add one, and see how
// many cues each has.
export default function SpeakersTab({
  busy,
  cues,
  draftDirty,
  p,
  speakers,
  tab,
  update,
}: {
  busy: boolean;
  cues: Cue[];
  draftDirty: boolean;
  p: Project | null | undefined;
  speakers: Speaker[];
  tab: Tab;
  update: (action: () => Promise<Snapshot>) => Promise<Snapshot | undefined>;
}) {
  const t = useT();
  const [speakerId, setSpeakerId] = useState("A");
  const [speakerName, setSpeakerName] = useState("");
  return (
    <>
      {tab === "speakers" && (
        <div className="stack">
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
    </>
  );
}
