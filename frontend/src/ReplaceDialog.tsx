import { Checkbox, Input, Modal, Space } from "antd";
import { useEffect, useState } from "react";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { useT } from "./i18n";
import { countMatches } from "./replace";

// Replaces text in every subtitle as one undoable step. The count below the
// fields is what Replace All will change.
export default function ReplaceDialog(props: {
  open: boolean;
  busy: boolean;
  cues: Cue[];
  initial: string;
  onClose: () => void;
  onReplace: (
    find: string,
    replacement: string,
    matchCase: boolean,
    matches: number,
  ) => Promise<boolean>;
}) {
  const t = useT();
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  useEffect(() => {
    if (props.open) setFind(props.initial);
  }, [props.open]);
  const found = countMatches(props.cues, find, matchCase);
  return (
    <Modal
      title={t.replace.title}
      open={props.open}
      onCancel={props.onClose}
      okText={t.replace.ok}
      okButtonProps={{ disabled: props.busy || !found.matches }}
      onOk={() =>
        void props
          .onReplace(find, replacement, matchCase, found.matches)
          .then((done) => done && props.onClose())
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Input
          autoFocus
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder={t.replace.find}
          aria-label={t.replace.find}
        />
        <Input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder={t.replace.with}
          aria-label={t.replace.with}
        />
        <Space size="large">
          <Checkbox
            checked={matchCase}
            onChange={(e) => setMatchCase(e.target.checked)}
          >
            {t.replace.matchCase}
          </Checkbox>
          {find && (
            <span className="muted">
              {found.matches
                ? t.replace.count(found.matches, found.cues)
                : t.replace.none}
            </span>
          )}
        </Space>
      </Space>
    </Modal>
  );
}
