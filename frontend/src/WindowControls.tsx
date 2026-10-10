import { useEffect, useState } from "react";
import { Window } from "@wailsio/runtime";
import { useT } from "./i18n";

// Glyphs drawn on a 10 px grid with 1 px strokes, like native caption buttons.
function Glyph({ d, crisp = true }: { d: string; crisp?: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      shapeRendering={crisp ? "crispEdges" : "geometricPrecision"}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

// The minimise, maximise and close buttons of a frameless window, drawn at
// the right of its title bar outside macOS.
export default function WindowControls({
  minimise = true,
  maximise = false,
}: {
  minimise?: boolean;
  maximise?: boolean;
}) {
  const t = useT();
  const [maximised, setMaximised] = useState(false);
  useEffect(() => {
    if (!maximise) return;
    let current = true;
    const check = () =>
      void Window.IsMaximised()
        .then((value) => {
          if (current) setMaximised(value);
        })
        .catch(() => {
          /* runtime may be starting */
        });
    check();
    window.addEventListener("resize", check);
    return () => {
      current = false;
      window.removeEventListener("resize", check);
    };
  }, [maximise]);
  return (
    <div className="window-controls">
      {minimise && (
        <button
          type="button"
          aria-label={t.window.minimise}
          title={t.window.minimise}
          onClick={() => void Window.Minimise()}
        >
          <Glyph d="M0 5.5h10" />
        </button>
      )}
      {maximise && (
        <button
          type="button"
          aria-label={maximised ? t.window.restore : t.window.maximise}
          title={maximised ? t.window.restore : t.window.maximise}
          onClick={() => void Window.ToggleMaximise()}
        >
          <Glyph
            d={
              maximised
                ? "M0.5 2.5h7v7h-7zM2.5 2.5v-2h7v7h-2"
                : "M0.5 0.5h9v9h-9z"
            }
          />
        </button>
      )}
      <button
        type="button"
        className="close"
        aria-label={t.window.close}
        title={t.window.close}
        onClick={() => void Window.Close()}
      >
        <Glyph d="M0.5 0.5l9 9M9.5 0.5l-9 9" crisp={false} />
      </button>
    </div>
  );
}
