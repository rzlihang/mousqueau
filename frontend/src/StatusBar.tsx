import { Button, Popover, Space, Spin, Tag, Tooltip } from "antd";
import {
  IconLayoutBottombar,
  IconLayoutSidebarRight,
  IconMovie,
} from "@tabler/icons-react";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Status } from "../bindings/mousqueau/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { formatTime } from "./editor";
import { decorative } from "./icons";
import { useT } from "./i18n";
import { shortcutOf } from "./keymap";
import { type Pane, PANES } from "./layout";

const settingsShortcut = shortcutOf("settings");
const PANE_ICONS = {
  viewer: IconMovie,
  inspector: IconLayoutSidebarRight,
  timeline: IconLayoutBottombar,
};

// The status bar: the environment and what is running on the left, the pane
// toggles and the selected cue on the right.
export default function StatusBar({
  status,
  busy,
  cue,
  hidden,
  onTogglePane,
}: {
  status: Status | null;
  busy: boolean;
  cue: Cue | undefined;
  hidden: readonly Pane[];
  onTogglePane: (pane: Pane) => void;
}) {
  const t = useT();
  const ready = !!status?.ffmpeg && !!status?.apiConfigured;
  const paneShown = (pane: Pane) => !hidden.includes(pane);
  return (
    <footer className="statusbar">
      <Popover
        trigger={["hover", "click"]}
        placement="topLeft"
        title={t.status.environment}
        content={
          <div className="env">
            <div>
              <span>FFmpeg</span>
              <Tag color={status?.ffmpeg ? "green" : "orange"}>
                {status?.ffmpeg ? t.common.ready : t.common.notInstalled}
              </Tag>
            </div>
            <div>
              <span>{status?.provider || t.status.provider}</span>
              <Tag color={status?.apiConfigured ? "green" : "default"}>
                {status?.apiConfigured
                  ? t.common.configured
                  : t.common.offlineOnly}
              </Tag>
            </div>
            <div>
              <span>yt-dlp</span>
              <Tag color={status?.ytdlp ? "green" : "default"}>
                {status?.ytdlp ? t.common.ready : t.status.optionalMissing}
              </Tag>
            </div>
            <Button
              type="link"
              size="small"
              className="env-link"
              onClick={() => void Editor.OpenSettings()}
            >
              {t.status.openSettings(settingsShortcut)}
            </Button>
          </div>
        }
      >
        <button type="button" className="env-button">
          <span
            className={`dot ${ready ? "ok" : status?.ffmpeg ? "partial" : "warn"}`}
            aria-hidden="true"
          />
          {ready
            ? t.status.allReady
            : status?.ffmpeg
              ? t.status.offline
              : t.status.noFfmpeg}
        </button>
      </Popover>
      {busy && (
        <Space size={6}>
          <Spin size="small" />
          <span>{status?.phase || t.status.working}</span>
          <Button
            danger
            size="small"
            type="text"
            onClick={() => void Editor.Cancel()}
          >
            {t.status.cancel}
          </Button>
        </Space>
      )}
      <div className="spacer" />
      <div className="pane-toggles">
        {PANES.map((pane) => {
          const Glyph = PANE_ICONS[pane];
          const name = {
            viewer: t.viewer.label,
            inspector: t.inspector.label,
            timeline: t.timeline.label,
          }[pane];
          const label = paneShown(pane)
            ? t.layout.hide(name)
            : t.layout.show(name);
          return (
            <Tooltip key={pane} title={label}>
              <button
                type="button"
                aria-label={label}
                aria-pressed={paneShown(pane)}
                onClick={() => onTogglePane(pane)}
              >
                <Glyph size={14} {...decorative} />
              </button>
            </Tooltip>
          );
        })}
      </div>
      {cue && (
        <span className="mono selected-info">
          {t.status.selected(cue.identifier)} · {formatTime(cue.start)} →{" "}
          {formatTime(cue.end)}
        </span>
      )}
    </footer>
  );
}
