import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Slider, Tag } from "antd";
import type {
  Speaker,
  Suggestion,
} from "../bindings/mousqueau/internal/analysis/models";
import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import { formatTime } from "./editor";
import { useT } from "./i18n";
import { isMac } from "./useSettings";
import {
  MAX_PPS,
  cueStatus,
  formatSeconds,
  majorStep,
  minPps,
  peakBetween,
  ppsToZoom,
  zoomToPps,
} from "./workspace";

type Props = {
  duration: number;
  cues: Cue[];
  speakers: Speaker[];
  suggestions: Suggestion[];
  selectedId: string;
  activeId: string;
  playhead: number;
  playing: boolean;
  range: [number, number];
  waveform: { peaks: number[]; rate: number } | null;
  waveformNote: string;
  dark: boolean;
  busy: boolean;
  onSeek: (time: number) => void;
  onSelectCue: (cue: Cue) => void;
  onRangeChange: (start: number, end: number) => void;
  actions: ReactNode;
};

const RULER = 26;
const AUDIO = 150;
const BAR = 3; // waveform bar width 2px plus 1px gap
const PAD = 40; // room after the end of the media
const MINOR: Record<number, number> = {
  1: 0.2,
  2: 0.5,
  5: 1,
  10: 2,
  15: 5,
  30: 5,
  60: 10,
  120: 30,
  300: 60,
  600: 120,
  900: 300,
  1800: 300,
  3600: 600,
};

export default function Timeline(props: Props) {
  const {
    duration,
    cues,
    speakers,
    suggestions,
    selectedId,
    activeId,
    playhead,
    playing,
    range,
    waveform,
    dark,
    busy,
  } = props;
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const pendingScroll = useRef<number | null>(null);
  const [zoomPps, setZoomPps] = useState(() => zoomToPps(50));
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewW, setViewW] = useState(800);
  // Zooming out stops once the whole duration fits.
  const leastPps = minPps(duration, viewW - PAD);
  const pps = Math.min(MAX_PPS, Math.max(leastPps, zoomPps));
  const contentW = Math.max(viewW, Math.ceil(duration * pps) + PAD);
  const viewStart = scrollLeft / pps;
  const viewEnd = (scrollLeft + viewW) / pps;
  const selected = cues.find((c) => c.id === selectedId);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewW(el.clientWidth));
    observer.observe(el);
    setViewW(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Apply the scroll position chosen while zooming once the new width exists.
  useLayoutEffect(() => {
    if (pendingScroll.current !== null && scroller.current) {
      scroller.current.scrollLeft = pendingScroll.current;
      setScrollLeft(scroller.current.scrollLeft);
      pendingScroll.current = null;
    }
  }, [pps]);

  function reveal(time: number, at: number) {
    const el = scroller.current;
    if (!el) return;
    const x = time * pps;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * at);
    }
  }
  useEffect(() => {
    if (playing) reveal(playhead, 0.1);
  }, [playhead, playing]);
  useEffect(() => {
    if (selected) reveal(selected.start, 0.25);
  }, [selectedId]);

  // Zooms so that time stays offset pixels from the left edge of the view.
  function zoomAround(next: number, time: number, offset: number) {
    const el = scroller.current;
    const nextPps = Math.min(MAX_PPS, Math.max(leastPps, next));
    const left = Math.max(0, time * nextPps - offset);
    if (nextPps === pps) {
      if (el) el.scrollLeft = left;
      return;
    }
    pendingScroll.current = left;
    setZoomPps(nextPps);
  }
  function changeZoom(zoom: number) {
    const el = scroller.current;
    if (!el) return;
    // Keep the playhead where it is on screen when visible, otherwise the left edge.
    const offset = playhead * pps - el.scrollLeft;
    const visible = offset >= 0 && offset <= el.clientWidth;
    zoomAround(
      zoomToPps(zoom, leastPps),
      visible ? playhead : el.scrollLeft / pps,
      visible ? offset : 0,
    );
  }
  // Ctrl or ⌘ with the wheel, or a trackpad pinch, zooms around the pointer;
  // the plain wheel scrolls sideways. React's wheel listener is passive, so
  // this one is added by hand to be able to stop the page from zooming.
  const onWheel = useRef<(e: WheelEvent) => void>(() => {});
  onWheel.current = (e) => {
    const el = scroller.current;
    if (!el) return;
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const offset = e.clientX - el.getBoundingClientRect().left;
      zoomAround(
        pps * Math.exp(-delta * 0.0025),
        (el.scrollLeft + offset) / pps,
        offset,
      );
    } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollLeft += delta;
    }
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const listener = (e: WheelEvent) => onWheel.current(e);
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.round(viewW * ratio);
    el.height = Math.round(AUDIO * ratio);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, viewW, AUDIO);
    if (!waveform) return;
    const style = getComputedStyle(el);
    const base = style.getPropertyValue("--wave").trim();
    const highlight = style.getPropertyValue("--wave-sel").trim();
    const first = Math.floor(scrollLeft / BAR) * BAR;
    for (let x = first; x < scrollLeft + viewW; x += BAR) {
      const from = x / pps;
      if (from > duration) break;
      const peak = peakBetween(
        waveform.peaks,
        waveform.rate,
        from,
        (x + BAR) / pps,
      );
      const h = Math.max(2, Math.round((peak / 100) * (AUDIO - 14)));
      ctx.fillStyle =
        selected && from >= selected.start && from <= selected.end
          ? highlight
          : base;
      ctx.fillRect(x - scrollLeft, Math.round((AUDIO - h) / 2), 2, h);
    }
  }, [
    waveform,
    pps,
    scrollLeft,
    viewW,
    selected?.start,
    selected?.end,
    dark,
    duration,
  ]);

  function timeAt(clientX: number) {
    const left = content.current?.getBoundingClientRect().left ?? 0;
    return Math.min(duration, Math.max(0, (clientX - left) / pps));
  }
  function rulerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, moved: false };
  }
  function rulerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || busy) return;
    if (!d.moved && Math.abs(e.clientX - d.x) < 4) return;
    d.moved = true;
    const a = timeAt(d.x);
    const b = timeAt(e.clientX);
    props.onRangeChange(Math.floor(Math.min(a, b)), Math.ceil(Math.max(a, b)));
  }
  function rulerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) props.onSeek(timeAt(e.clientX));
  }

  const step = majorStep(pps);
  const minor = MINOR[step];
  const ticks: { t: number; major: boolean }[] = [];
  for (
    let i = Math.floor(viewStart / minor);
    i * minor <= Math.min(viewEnd, duration);
    i++
  ) {
    const t = i * minor;
    ticks.push({ t, major: Math.abs(t / step - Math.round(t / step)) < 1e-6 });
  }
  const margin = 200 / pps;
  const visible = cues.filter(
    (c) => c.end >= viewStart - margin && c.start <= viewEnd + margin,
  );
  const x = (t: number) => Math.round(t * pps);
  const w = (c: Cue) => Math.max(2, Math.round((c.end - c.start) * pps) - 2);

  return (
    <section className="timeline" aria-label={t.timeline.label}>
      <div className="timeline-toolbar">
        <h2>{t.timeline.label}</h2>
        <span className="mono muted">
          {t.timeline.showing} {formatTime(viewStart)} —{" "}
          {formatTime(Math.min(viewEnd, duration))}
        </span>
        <div className="zoom">
          <span className="muted">{t.timeline.zoom}</span>
          <Slider
            value={ppsToZoom(pps, leastPps)}
            step={0.1}
            onChange={changeZoom}
            tooltip={{ open: false }}
            aria-label={t.timeline.zoomLabel}
          />
        </div>
        <div className="spacer" />
        {props.actions}
      </div>
      <div className="timeline-body">
        <div className="track-heads" aria-hidden="true">
          <div style={{ height: RULER }} />
          <div className="track-audio">{t.timeline.audio}</div>
          <div className="track-cues">{t.timeline.cues}</div>
          <div className="track-speakers">{t.timeline.speakers}</div>
          <div className="track-markers">{t.timeline.suggestions}</div>
        </div>
        <div
          className="track-scroll"
          id="timeline-tracks"
          ref={scroller}
          onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        >
          <div
            className="track-content"
            ref={content}
            style={{ width: contentW }}
          >
            {selected && (
              <div
                className="selected-band"
                style={{
                  left: x(selected.start),
                  width: x(selected.end) - x(selected.start),
                }}
              />
            )}
            <div
              className="ruler"
              title={t.timeline.rulerHint}
              onPointerDown={rulerDown}
              onPointerMove={rulerMove}
              onPointerUp={rulerUp}
              onPointerCancel={() => (drag.current = null)}
            >
              {ticks.map((k) => (
                <div
                  key={k.t}
                  className={k.major ? "tick major" : "tick"}
                  style={{ left: x(k.t) }}
                />
              ))}
              {ticks
                .filter((k) => k.major)
                .map((k) => (
                  <span
                    key={k.t}
                    className="tick-label"
                    style={{ left: x(k.t) + 4 }}
                  >
                    {formatSeconds(k.t)}
                  </span>
                ))}
              <div
                className="range-bar"
                style={{
                  left: x(range[0]),
                  width: Math.max(0, x(range[1]) - x(range[0])),
                }}
              />
            </div>
            <div
              className="track-audio"
              onClick={(e) => props.onSeek(timeAt(e.clientX))}
            >
              <canvas
                ref={canvas}
                className="waveform"
                style={{ left: scrollLeft, width: viewW, height: AUDIO }}
              />
              {!waveform && (
                <span className="track-note" style={{ left: scrollLeft + 12 }}>
                  {props.waveformNote}
                </span>
              )}
            </div>
            <div className="track-cues">
              {visible.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  className={`block${c.id === selectedId ? " selected" : ""}${c.id === activeId ? " playing" : ""}`}
                  style={{ left: x(c.start) + 1, width: w(c) }}
                  aria-label={t.timeline.selectCue(c.identifier)}
                  onClick={() => props.onSelectCue(c)}
                >
                  <span className="block-id">#{c.identifier}</span>
                  <span className="block-text">{c.text}</span>
                </button>
              ))}
            </div>
            <div
              className="track-speakers"
              onClick={(e) => props.onSeek(timeAt(e.clientX))}
            >
              {visible.map((c) => {
                const ids = c.speakerIds ?? [];
                if (!ids.length)
                  return (
                    <div
                      key={c.id}
                      className="speaker-bar unknown"
                      style={{
                        left: x(c.start) + 1,
                        width: w(c),
                        top: 7,
                        height: 26,
                      }}
                    >
                      {t.common.unknownSpeaker}
                    </div>
                  );
                const each = Math.floor(
                  (26 - (ids.length - 1) * 2) / ids.length,
                );
                return ids.map((id, k) => {
                  const sp = speakers.find((s) => s.id === id);
                  return (
                    <div
                      key={`${c.id}-${id}`}
                      className="speaker-bar"
                      style={{
                        left: x(c.start) + 1,
                        width: w(c),
                        top: 7 + k * (each + 2),
                        height: each,
                        lineHeight: `${each - 2}px`,
                        background: sp?.color || "var(--muted)",
                      }}
                    >
                      {sp?.name || id}
                    </div>
                  );
                });
              })}
            </div>
            <div className="track-markers">
              {visible.map((c) => {
                const status = cueStatus(c, suggestions);
                if (!status) return null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="marker"
                    disabled={busy}
                    style={{ left: x(c.start) + 1 }}
                    aria-label={t.timeline.selectCue(c.identifier)}
                    onClick={() => props.onSelectCue(c)}
                  >
                    <Tag color={status === "review" ? "orange" : "blue"}>
                      {status === "review"
                        ? t.common.pendingReview
                        : t.common.pendingDecision}
                    </Tag>
                  </button>
                );
              })}
            </div>
            <div className="playhead" style={{ left: x(playhead) }} />
            <div className="playhead-cap" style={{ left: x(playhead) - 5 }} />
          </div>
        </div>
      </div>
      <ZoomScrollbar
        total={contentW / pps}
        start={viewStart}
        span={viewW / pps}
        label={t.timeline.scrollbar}
        hint={t.timeline.scrollbarHint(isMac ? "⌘" : "Ctrl")}
        onScroll={(time) => {
          if (scroller.current) scroller.current.scrollLeft = time * pps;
        }}
        onZoom={(start, end, edge) =>
          edge === "start"
            ? zoomAround(viewW / (end - start), end, viewW)
            : zoomAround(viewW / (end - start), start, 0)
        }
      />
    </section>
  );
}

type ScrollbarProps = {
  total: number; // seconds the content spans
  start: number; // first second in view
  span: number; // seconds in view
  label: string;
  hint: string;
  onScroll: (start: number) => void;
  onZoom: (start: number, end: number, edge: "start" | "end") => void;
};
type Drag = {
  mode: "pan" | "start" | "end";
  x: number;
  width: number;
  total: number;
  start: number;
  end: number;
};

// A horizontal scrollbar whose thumb ends can be dragged to zoom, as in
// video and audio editors. Arrow keys scroll it from the keyboard.
function ZoomScrollbar(props: ScrollbarProps) {
  const { total, start, span } = props;
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const left = total > 0 ? Math.min(1, start / total) : 0;
  const width = total > 0 ? Math.min(1 - left, span / total) : 1;

  function down(e: PointerEvent<HTMLDivElement>) {
    const el = bar.current;
    if (e.button !== 0 || !el) return;
    const rect = el.getBoundingClientRect();
    const target = e.target as HTMLElement;
    const mode = target.classList.contains("zoom-handle")
      ? target.classList.contains("start")
        ? "start"
        : "end"
      : target.closest(".zoom-thumb")
        ? "pan"
        : null;
    if (!mode) {
      // A press beside the thumb centres the view there.
      const at = ((e.clientX - rect.left) / rect.width) * total;
      props.onScroll(Math.max(0, at - span / 2));
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      x: e.clientX,
      width: rect.width,
      total,
      start,
      end: start + span,
    };
    setDragging(true);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dt = ((e.clientX - d.x) / d.width) * d.total;
    // At least a quarter second stays in view; MAX_PPS limits it further.
    if (d.mode === "pan") props.onScroll(Math.max(0, d.start + dt));
    else if (d.mode === "start")
      props.onZoom(
        Math.min(d.end - 0.25, Math.max(0, d.start + dt)),
        d.end,
        "start",
      );
    else
      props.onZoom(
        d.start,
        Math.max(d.start + 0.25, Math.min(d.total, d.end + dt)),
        "end",
      );
  }
  function up() {
    drag.current = null;
    setDragging(false);
  }

  return (
    <div
      ref={bar}
      className="zoom-scrollbar"
      role="scrollbar"
      tabIndex={0}
      aria-label={props.label}
      aria-controls="timeline-tracks"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(
        total > span ? (start / (total - span)) * 100 : 0,
      )}
      title={props.hint}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={(e) => {
        const step = {
          ArrowLeft: -0.1,
          ArrowRight: 0.1,
          PageUp: -1,
          PageDown: 1,
        }[e.key];
        if (step === undefined) return;
        e.preventDefault();
        props.onScroll(Math.max(0, start + step * span));
      }}
    >
      <div
        className={`zoom-thumb${dragging ? " dragging" : ""}`}
        style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
      >
        <div className="zoom-handle start" />
        <div className="zoom-handle end" />
      </div>
    </div>
  );
}
