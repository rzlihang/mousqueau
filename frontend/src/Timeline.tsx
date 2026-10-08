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
import {
  cueStatus,
  formatSeconds,
  majorStep,
  peakBetween,
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
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const pendingScroll = useRef<number | null>(null);
  const [zoom, setZoom] = useState(50);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewW, setViewW] = useState(800);
  const pps = zoomToPps(zoom);
  const contentW = Math.max(viewW, Math.ceil(duration * pps) + 40);
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

  function changeZoom(next: number) {
    const el = scroller.current;
    const nextPps = zoomToPps(next);
    if (el) {
      // Keep the playhead where it is on screen when visible, otherwise the left edge.
      const offset = playhead * pps - el.scrollLeft;
      const anchor =
        offset >= 0 && offset <= el.clientWidth
          ? playhead
          : el.scrollLeft / pps;
      const keep = anchor === playhead ? offset : 0;
      pendingScroll.current = Math.max(0, anchor * nextPps - keep);
    }
    setZoom(next);
  }

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
    <section className="timeline" aria-label="时间轴">
      <div className="timeline-toolbar">
        <h2>时间轴</h2>
        <span className="mono muted">
          显示 {formatTime(viewStart)} —{" "}
          {formatTime(Math.min(viewEnd, duration))}
        </span>
        <div className="zoom">
          <span className="muted">缩放</span>
          <Slider
            value={zoom}
            onChange={changeZoom}
            tooltip={{ open: false }}
            aria-label="时间轴缩放"
          />
        </div>
        <div className="spacer" />
        {props.actions}
      </div>
      <div className="timeline-body">
        <div className="track-heads" aria-hidden="true">
          <div style={{ height: RULER }} />
          <div className="track-audio">音频</div>
          <div className="track-cues">字幕</div>
          <div className="track-speakers">说话人</div>
          <div className="track-markers">校正建议</div>
        </div>
        <div
          className="track-scroll"
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
              title="点击定位播放头；拖动选取分析范围"
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
                  aria-label={`选择第 ${c.identifier} 句`}
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
                      Unknown
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
                    aria-label={`选择第 ${c.identifier} 句`}
                    onClick={() => props.onSelectCue(c)}
                  >
                    <Tag color={status === "review" ? "orange" : "blue"}>
                      {status === "review" ? "需人工复核" : "待确认"}
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
    </section>
  );
}
