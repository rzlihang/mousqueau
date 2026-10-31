import { Button, InputNumber, Modal, Space } from "antd";
import { useEffect, useState } from "react";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { formatTime } from "./editor";
import { useT } from "./i18n";

// Moves every subtitle by one offset in seconds. The reference cue, the
// selected one or else the first, shows where its start lands; with media,
// its start can be aligned to the playhead.
export default function ShiftDialog(props: {
  open: boolean;
  busy: boolean;
  reference?: Cue;
  playhead?: number;
  onClose: () => void;
  onShift: (seconds: number) => Promise<boolean>;
}) {
  const t = useT();
  const [offset, setOffset] = useState<number | null>(0);
  useEffect(() => {
    if (props.open) setOffset(0);
  }, [props.open]);
  const ms = Math.round((offset ?? 0) * 1000);
  const ref = props.reference;
  const start = ref ? Math.round(ref.start * 1000) + ms : 0;
  return (
    <Modal
      title={t.shift.title}
      open={props.open}
      onCancel={props.onClose}
      okText={t.shift.ok}
      okButtonProps={{ disabled: props.busy || ms === 0 || start < 0 }}
      onOk={() =>
        void props.onShift(ms / 1000).then((done) => done && props.onClose())
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Space wrap>
          <InputNumber
            autoFocus
            value={offset}
            onChange={setOffset}
            step={0.1}
            precision={3}
            suffix={t.shift.unit}
            className="mono-input"
            style={{ width: 180 }}
            aria-label={t.shift.title}
          />
          {ref && props.playhead !== undefined && (
            <Button
              onClick={() =>
                setOffset(
                  (Math.round(props.playhead! * 1000) -
                    Math.round(ref.start * 1000)) /
                    1000,
                )
              }
            >
              {t.shift.align}
            </Button>
          )}
        </Space>
        {ref && (
          <span className="muted mono">
            #{ref.identifier} {formatTime(ref.start)} →{" "}
            {start < 0 ? "—" : formatTime(start / 1000)}
          </span>
        )}
      </Space>
    </Modal>
  );
}
