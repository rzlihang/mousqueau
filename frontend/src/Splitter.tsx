import type { KeyboardEvent, PointerEvent } from "react";

/**
 * A draggable divider between two panes. `start` reads the pane's current
 * size when a drag begins; `sign` is -1 when dragging towards the pane
 * shrinks it. Arrow keys resize too, and a double-click restores the default.
 */
export default function Splitter({
  axis,
  sign,
  label,
  start,
  onResize,
  onReset,
}: {
  axis: "x" | "y";
  sign: 1 | -1;
  label: string;
  start: () => number;
  onResize: (size: number) => void;
  onReset: () => void;
}) {
  const position = (e: { clientX: number; clientY: number }) =>
    axis === "x" ? e.clientX : e.clientY;

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const origin = position(e);
    const base = start();
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    const move = (ev: globalThis.PointerEvent) =>
      onResize(base + sign * (position(ev) - origin));
    const up = () => {
      el.classList.remove("dragging");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  function key(e: KeyboardEvent<HTMLDivElement>) {
    const back = axis === "x" ? "ArrowLeft" : "ArrowUp";
    const forward = axis === "x" ? "ArrowRight" : "ArrowDown";
    if (e.key !== back && e.key !== forward) return;
    e.preventDefault();
    const step = (e.shiftKey ? 40 : 10) * (e.key === forward ? 1 : -1);
    onResize(start() + sign * step);
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      title={label}
      className={`splitter splitter-${axis}`}
      onPointerDown={down}
      onKeyDown={key}
      onDoubleClick={onReset}
    />
  );
}
