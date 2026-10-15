import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { messagesFor } from "./i18n";
import IconButton from "./IconButton";

vi.mock("antd", () => ({
  Button: ({
    icon,
    children,
    ...props
  }: {
    icon?: unknown;
    children?: unknown;
    [key: string]: unknown;
  }) => (
    <button {...props}>
      {icon as never}
      {children as never}
    </button>
  ),
  Tooltip: ({
    title,
    children,
  }: {
    title?: unknown;
    children?: unknown;
  }) => <span data-tooltip={String(title)}>{children as never}</span>,
}));

describe("IconButton", () => {
  it("shows only the icon, with the locale name as the accessible name and tooltip", () => {
    const html = renderToStaticMarkup(
      <IconButton
        label="Undo"
        tooltip="Undo (Ctrl+Z)"
        icon={<svg data-icon="undo" />}
      />,
    );
    expect(html).toContain('aria-label="Undo"');
    expect(html).toContain('data-tooltip="Undo (Ctrl+Z)"');
    expect(html).toContain('data-icon="undo"');
    expect(html).not.toContain(">Undo<");
    expect(html).not.toContain(">Undo (Ctrl+Z)<");
  });

  it("keeps the tooltip when the control is disabled", () => {
    const html = renderToStaticMarkup(
      <IconButton label="Play" icon={<svg />} disabled />,
    );
    expect(html).toContain('data-tooltip="Play"');
    expect(html).toContain("disabled");
    expect(html).toContain('aria-label="Play"');
    expect(html).not.toContain(">Play<");
  });
});

describe("icon-only names", () => {
  it("stays a short label in every locale", () => {
    for (const locale of ["zh-CN", "zh-TW", "ja-JP", "en-US"] as const) {
      const t = messagesFor(locale);
      const names = [
        t.menu.title,
        t.editor.undo,
        t.editor.redo,
        t.viewer.previous,
        t.viewer.play,
        t.viewer.pause,
        t.viewer.next,
        t.window.minimise,
        t.window.maximise,
        t.window.restore,
        t.window.close,
      ];
      for (const name of names) {
        expect(name.trim()).not.toBe("");
        expect(name).not.toMatch(/[。！？.!?]/);
      }
    }
  });
});
