import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  type Layout,
  type Pane,
  clamp,
  layoutMode,
  loadLayout,
  timelineSize,
  togglePane,
  viewerSize,
} from "./layout";

const LAYOUT_KEY = "mousqueau-layout";
const VIEWER_MIN = 320;

function storedLayout(): Layout {
  try {
    return loadLayout(localStorage.getItem(LAYOUT_KEY));
  } catch {
    return {};
  }
}
const windowMode = () => layoutMode(window.innerWidth, window.innerHeight);
const widthOf = (el: HTMLElement | null) =>
  el?.getBoundingClientRect().width ?? 0;

// The editor's pane arrangement: which one the window's shape gives, the
// panes the user hid, and the sizes dragged in each arrangement, kept in
// localStorage. The refs go on the panes the dividers measure.
export function usePaneLayout() {
  const [layout, setLayout] = useState<Layout>(storedLayout);
  const [mode, setMode] = useState(windowMode);
  useEffect(() => {
    const resized = () => setMode(windowMode());
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      /* pane sizes are only a convenience */
    }
  }, [layout]);

  const upperRef = useRef<HTMLDivElement>(null);
  const cueGridRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const paneShown = (pane: Pane) => !layout.hidden?.includes(pane);
  // Outside the wide arrangement the cue list and the inspector share one
  // area: the list, or one of the inspector's tabs.
  const stacked = mode !== "wide";
  const [listOpen, setListOpen] = useState(true);
  const inspectorOpen = paneShown("inspector") && !(stacked && listOpen);
  const listShown = !stacked || listOpen || !paneShown("inspector");

  function resizeColumn(side: "left" | "right", size: number) {
    const width = widthOf(upperRef.current);
    // The cue list keeps 240px when it is the only other column.
    const max =
      side === "left"
        ? width - widthOf(inspectorRef.current) - VIEWER_MIN
        : width -
          (paneShown("viewer")
            ? widthOf(cueGridRef.current) + VIEWER_MIN
            : 240);
    const min = side === "left" ? 240 : 260;
    setLayout((l) => ({ ...l, [side]: clamp(size, min, max) }));
  }
  // The viewer's width beside the work area, or its height above it.
  function resizeViewer(size: number) {
    if (mode === "wide") return;
    const box = upperRef.current?.getBoundingClientRect();
    // The work area keeps 280px of width or 160px of height. In a window
    // too small for the viewer's usual minimum as well, the viewer gives way.
    const [least, max] =
      mode === "compact"
        ? [240, (box?.width ?? 0) - 280]
        : [100, (box?.height ?? 0) - 160];
    const min = Math.max(0, Math.min(least, max));
    setLayout((l) => ({ ...l, [viewerSize(mode)]: clamp(size, min, max) }));
  }
  // The timeline can shrink, with its tracks scrolling, but never grow past
  // its content.
  function resizeTimeline(size: number) {
    const section = dockRef.current?.querySelector<HTMLElement>(".timeline");
    let natural = 0;
    for (const child of Array.from(section?.children ?? []) as HTMLElement[])
      natural += child.classList.contains("timeline-body")
        ? child.scrollHeight
        : child.offsetHeight;
    const max = Math.min(natural || Infinity, window.innerHeight - 340);
    setLayout((l) => ({ ...l, [timelineSize(mode)]: clamp(size, 80, max) }));
  }
  const viewerKey = mode === "wide" ? undefined : viewerSize(mode);

  return {
    layout,
    mode,
    stacked,
    paneShown,
    hidden: layout.hidden ?? [],
    toggle: (pane: Pane) => setLayout((l) => togglePane(l, pane)),
    // Shows a pane that may be hidden.
    reveal: (pane: Pane) =>
      setLayout((l) => (l.hidden?.includes(pane) ? togglePane(l, pane) : l)),
    listOpen,
    setListOpen,
    listShown,
    inspectorOpen,
    refs: { upperRef, cueGridRef, viewerRef, inspectorRef, dockRef },
    widthOf,
    resizeColumn,
    resizeViewer,
    resizeTimeline,
    reset: (key: keyof Layout) =>
      setLayout((l) => ({ ...l, [key]: undefined })),
    viewerKey,
    timelineKey: timelineSize(mode),
    // The stylesheet arranges the panes by data-layout and data-hide; these
    // are the sizes the user dragged in this arrangement.
    upperStyle: {
      "--left": layout.left && `minmax(240px, ${layout.left}px)`,
      "--right": layout.right && `minmax(260px, ${layout.right}px)`,
      // No minimum: a size dragged in a larger window must not push the
      // work area out of a smaller one.
      "--viewer":
        viewerKey && layout[viewerKey]
          ? `minmax(0, ${layout[viewerKey]}px)`
          : undefined,
    } as CSSProperties,
  };
}
