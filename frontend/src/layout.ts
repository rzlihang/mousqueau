// How the editor arranges its panes. The window's shape picks the
// arrangement; the user hides panes and drags the dividers.

/**
 * - wide: cue list, viewer and inspector side by side.
 * - compact: a short, narrow window; the viewer beside one work area.
 * - column: a window taller than it is wide; the viewer above the work area.
 *
 * In compact and column the cue list and the inspector share the work area,
 * one shown at a time.
 */
export type LayoutMode = "wide" | "compact" | "column";
export type Pane = "viewer" | "inspector" | "timeline";
export const PANES: readonly Pane[] = ["viewer", "inspector", "timeline"];

type Size =
  | "left"
  | "right"
  | "timeline"
  | "compactViewer"
  | "compactTimeline"
  | "columnViewer"
  | "columnTimeline";
// Sizes the user dragged, in pixels; unset sizes follow the stylesheet.
export type Layout = Partial<Record<Size, number>> & { hidden?: Pane[] };

export function layoutMode(width: number, height: number): LayoutMode {
  // A tiled half of a screen or a rotated monitor.
  if (height > width && width < 1400) return "column";
  return width >= 1000 ? "wide" : "compact";
}

// Each arrangement remembers its own sizes.
export const timelineSize = (mode: LayoutMode): Size =>
  mode === "wide" ? "timeline" : `${mode}Timeline`;
export const viewerSize = (mode: "compact" | "column"): Size => `${mode}Viewer`;

export function loadLayout(stored: string | null): Layout {
  try {
    const value: unknown = JSON.parse(stored ?? "{}");
    if (!value || typeof value !== "object") return {};
    const layout = value as Layout;
    const hidden = Array.isArray(layout.hidden)
      ? PANES.filter((p) => layout.hidden!.includes(p))
      : [];
    return { ...layout, hidden };
  } catch {
    return {};
  }
}

export function togglePane(layout: Layout, pane: Pane): Layout {
  const hidden = layout.hidden ?? [];
  return {
    ...layout,
    hidden: hidden.includes(pane)
      ? hidden.filter((p) => p !== pane)
      : [...hidden, pane],
  };
}

export const clamp = (size: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(size, max)));
