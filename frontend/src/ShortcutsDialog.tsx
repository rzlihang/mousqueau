import { Modal } from "antd";
import type { Speaker } from "../bindings/mousqueau/internal/analysis/models";
import { useT } from "./i18n";
import {
  COMMANDS,
  type CommandId,
  type Group,
  keyLabel,
  shortcutOf,
} from "./keymap";

const GROUPS: Group[] = ["file", "playback", "cues", "speakers", "timeline"];

// Lists every shortcut from the keymap, so the list cannot drift from the
// keys that work.
export default function ShortcutsDialog({
  open,
  speakers,
  onClose,
}: {
  open: boolean;
  speakers: Speaker[];
  onClose: () => void;
}) {
  const t = useT();
  const s = t.shortcuts;
  const rows = (group: Group): { label: string; keys: string }[] => {
    if (group === "speakers")
      return [
        {
          label: s.speakerN,
          keys: `${shortcutOf("speaker1")} … ${shortcutOf("speaker9")}`,
        },
        ...speakers.slice(0, 9).map((sp, i) => ({
          label: `　${sp.name}`,
          keys: shortcutOf(`speaker${i + 1}` as CommandId),
        })),
        { label: s.speakerNone, keys: shortcutOf("speaker0") },
      ];
    const list = COMMANDS.filter((c) => c.group === group).map((c) => ({
      label: s.commands[c.id as keyof typeof s.commands],
      keys: c.keys.map(keyLabel).join(" / "),
    }));
    if (group === "cues")
      list.splice(list.findIndex((r) => r.label === s.commands.editText) + 1, 0, {
        label: s.leaveText,
        keys: "Esc",
      });
    return list;
  };
  return (
    <Modal
      open={open}
      title={t.shortcuts.title}
      footer={null}
      width={640}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      onCancel={onClose}
    >
      <p className="muted small">{s.scopes}</p>
      <div className="shortcut-groups">
        {GROUPS.map((group) => (
          <section key={group}>
            <h3>{s.groups[group]}</h3>
            <dl>
              {rows(group).map((r) => (
                <div key={r.label} className="shortcut-row">
                  <dt>{r.label}</dt>
                  <dd>
                    <kbd>{r.keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
