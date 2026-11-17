import type { ComponentProps } from "react";
import { Button, InputNumber, Popover } from "antd";
import { numberControls } from "./icons";
import { useT } from "./i18n";
import { timelineSize } from "./layout";
import Splitter from "./Splitter";
import Timeline from "./Timeline";
import type { PaneLayout } from "./usePaneLayout";
import { formatSeconds } from "./workspace";

type Props = Omit<ComponentProps<typeof Timeline>, "actions"> & {
  panes: PaneLayout;
  canAnalyze: boolean;
  onAnalyze: () => void;
  onRangeStartChange: (value: number) => void;
  onRangeEndChange: (value: number) => void;
};

// The resizable timeline and its analysis controls. Shared range and editor
// state stay in App so keyboard commands and analysis use the same values.
export default function TimelineDock({
  panes,
  canAnalyze,
  onAnalyze,
  onRangeStartChange,
  onRangeEndChange,
  ...timeline
}: Props) {
  const t = useT();
  const { layout, mode, resizeTimeline, reset } = panes;
  const { dockRef } = panes.refs;
  const sizeKey = timelineSize(mode);
  const {
    range: [rangeStart, rangeEnd],
    playhead,
    busy,
    onRangeChange,
  } = timeline;
  const rangeSeconds = rangeEnd - rangeStart;
  const rangeValid = rangeSeconds >= 60 && rangeSeconds <= 300;

  return (
    <div
      className="timeline-dock"
      ref={dockRef}
      style={layout[sizeKey] ? { height: layout[sizeKey] } : undefined}
    >
      <Splitter
        axis="y"
        sign={-1}
        label={t.common.resizeHeight}
        start={() => dockRef.current?.getBoundingClientRect().height ?? 0}
        onResize={resizeTimeline}
        onReset={() => reset(sizeKey)}
      />
      <Timeline
        {...timeline}
        actions={
          <>
            <span className={rangeValid ? "" : "range-invalid"}>
              {t.range.label}{" "}
              <span className="mono">
                {formatSeconds(rangeStart)} — {formatSeconds(rangeEnd)}
              </span>{" "}
              · {t.common.seconds(rangeSeconds)}
            </span>
            <Popover
              trigger="click"
              title={t.range.label}
              content={
                <div className="range-form">
                  <label>
                    {t.range.start}
                    <InputNumber
                      size="small"
                      controls={numberControls}
                      min={0}
                      value={rangeStart}
                      disabled={busy}
                      onChange={(v) => onRangeStartChange(v ?? 0)}
                    />
                  </label>
                  <label>
                    {t.range.end}
                    <InputNumber
                      size="small"
                      controls={numberControls}
                      min={0}
                      value={rangeEnd}
                      disabled={busy}
                      onChange={(v) => onRangeEndChange(v ?? 60)}
                    />
                  </label>
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() =>
                      onRangeChange(
                        Math.floor(playhead),
                        Math.floor(playhead) + 60,
                      )
                    }
                  >
                    {t.range.fromPlayhead}
                  </Button>
                </div>
              }
            >
              <Button size="small" disabled={busy}>
                {t.range.adjust}
              </Button>
            </Popover>
            <Button
              size="small"
              type="primary"
              disabled={busy || !canAnalyze}
              onClick={onAnalyze}
            >
              {t.range.analyze}
            </Button>
          </>
        }
      />
    </div>
  );
}
