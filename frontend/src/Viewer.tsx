import { type ReactNode } from "react";
import { Button, Select } from "antd";
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
} from "@tabler/icons-react";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { formatTime } from "./editor";
import IconButton from "./IconButton";
import { decorative } from "./icons";
import { useT } from "./i18n";
import { shortcutOf } from "./keymap";
import { viewerSize } from "./layout";
import Splitter from "./Splitter";
import type { PaneLayout } from "./usePaneLayout";
import { type Playback, RATES } from "./usePlayback";

// The viewer: the media with the current subtitle over it, which is the
// selected cue's text field, and the transport below. Playback itself lives
// in usePlayback; this draws it.
export default function Viewer({
  playback,
  panes,
  busy,
  draftDirty,
  cue,
  cueCount,
  duration,
  overlayCue,
  textField,
  stepCue,
  onImportMedia,
  onEditOverlay,
}: {
  playback: Playback;
  panes: PaneLayout;
  busy: boolean;
  draftDirty: boolean;
  // The selected cue.
  cue: Cue | undefined;
  cueCount: number;
  // The project's length, shown until the media reports its own.
  duration: number;
  // The cue whose text is over the picture: the one playing, or the selected
  // one while it is being edited.
  overlayCue: Cue | undefined;
  textField: (inspector: boolean) => ReactNode;
  stepCue: (delta: number) => void;
  onImportMedia: () => void;
  // Selects a cue that is showing but not selected, to edit its text.
  onEditOverlay: (cue: Cue) => void;
}) {
  const t = useT();
  const { mediaUrl, playhead, playing, rate, mediaDuration, hasVideo } = playback;
  const { togglePlay, setSpeed } = playback;
  const { mode, paneShown, widthOf, resizeColumn, resizeViewer } = panes;
  const { viewerRef, cueGridRef } = panes.refs;
  const resetLayout = panes.reset;
  return (
    <section className="viewer" ref={viewerRef} aria-label={t.viewer.label}>
      {mode === "wide" ? (
        <Splitter
          axis="x"
          sign={1}
          label={t.common.resizeWidth}
          start={() => widthOf(cueGridRef.current)}
          onResize={(size) => resizeColumn("left", size)}
          onReset={() => resetLayout("left")}
        />
      ) : (
        <Splitter
          end
          axis={mode === "compact" ? "x" : "y"}
          sign={1}
          label={
            mode === "compact" ? t.common.resizeWidth : t.common.resizeHeight
          }
          start={() => {
            const box = viewerRef.current?.getBoundingClientRect();
            return (mode === "compact" ? box?.width : box?.height) ?? 0;
          }}
          onResize={resizeViewer}
          onReset={() => resetLayout(viewerSize(mode))}
        />
      )}
      <div className="viewer-frame">
        {mediaUrl ? (
          <>
            <video key={mediaUrl} {...playback.videoProps} />
            {!hasVideo && (
              <span className="viewer-note">{t.viewer.audioOnly}</span>
            )}
          </>
        ) : (
          <div className="viewer-empty">
            <span>{t.viewer.empty}</span>
            <Button
              size="small"
              disabled={busy || draftDirty}
              onClick={onImportMedia}
            >
              {t.common.importMedia}
            </Button>
          </div>
        )}
        {overlayCue && (
          <div className="subtitle-overlay">
            {overlayCue.id === cue?.id ? (
              paneShown("viewer") && textField(false)
            ) : (
              <button
                type="button"
                className="subtitle-edit"
                title={t.viewer.clickToEdit}
                disabled={busy}
                onClick={() => onEditOverlay(overlayCue)}
              >
                {overlayCue.text}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="transport">
        <div className="clock">
          <span>{formatTime(playhead)}</span>
          <span className="muted small">
            / {formatTime(mediaDuration || duration)}
          </span>
        </div>
        <div className="transport-buttons">
          <IconButton
            label={t.viewer.previous}
            tooltip={t.editor.withShortcut(
              t.viewer.previous,
              shortcutOf("previousCue"),
            )}
            icon={<IconPlayerSkipBack size={18} {...decorative} />}
            disabled={busy || !cueCount}
            onClick={() => stepCue(-1)}
          />
          <IconButton
            label={playing ? t.viewer.pause : t.viewer.play}
            tooltip={t.editor.withShortcut(
              playing ? t.viewer.pause : t.viewer.play,
              shortcutOf("playPause"),
            )}
            icon={
              playing ? (
                <IconPlayerPause size={18} {...decorative} />
              ) : (
                <IconPlayerPlay size={18} {...decorative} />
              )
            }
            disabled={!mediaUrl}
            onClick={togglePlay}
          />
          <IconButton
            label={t.viewer.next}
            tooltip={t.editor.withShortcut(
              t.viewer.next,
              shortcutOf("nextCue"),
            )}
            icon={<IconPlayerSkipForward size={18} {...decorative} />}
            disabled={busy || !cueCount}
            onClick={() => stepCue(1)}
          />
        </div>
        <Select
          size="small"
          aria-label={t.viewer.speed}
          value={rate}
          style={{ width: 72 }}
          onChange={setSpeed}
          options={RATES.map((v) => ({
            value: v,
            label: `${v.toFixed(v % 0.5 ? 2 : 1)}×`,
          }))}
        />
      </div>
    </section>
  );
}
