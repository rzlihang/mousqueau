import { useState } from "react";
import { Badge, Button, Dropdown, Tooltip } from "antd";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconDeviceFloppy,
  IconFileImport,
  IconFolderOpen,
  IconMenu2,
} from "@tabler/icons-react";
import { Window } from "@wailsio/runtime";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Snapshot } from "../bindings/mousqueau/models";
import IconButton from "./IconButton";
import type { ImportTab } from "./ImportDialog";
import { decorative } from "./icons";
import { useT } from "./i18n";
import { shortcutOf } from "./keymap";
import { customChrome, isMac } from "./useSettings";
import WindowControls from "./WindowControls";

const settingsShortcut = shortcutOf("settings");

// The editor's title bar: the application menu (outside macOS, where the
// menu bar has it), the project's name, and the toolbar. It owns nothing but
// the menu's open state; every action is the editor's.
export default function TitleBar({
  name,
  summary,
  unsaved: dirty,
  hasProject: p,
  busy,
  draftDirty,
  showSample,
  canUndo,
  canRedo,
  canShift,
  replaceProject,
  save,
  update,
  run,
  setImportTab,
  setShiftOpen,
  setReplaceOpen,
  setShortcutsOpen,
}: {
  name: string;
  // Edited state and counts; absent without a project.
  summary?: string;
  unsaved: boolean;
  hasProject: boolean;
  busy: boolean;
  draftDirty: boolean;
  showSample: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canShift: boolean;
  replaceProject: (action: () => Promise<Snapshot>) => unknown;
  save: (exportSRT: boolean) => Promise<unknown>;
  update: (action: () => Promise<Snapshot>) => Promise<unknown>;
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
  setImportTab: (tab: ImportTab) => void;
  setShiftOpen: (open: boolean) => void;
  setReplaceOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header
      className="titlebar"
      onDoubleClick={(e) => {
        // Wails acts on title bar double-clicks only on macOS.
        if (
          customChrome &&
          e.target instanceof Element &&
          !e.target.closest("button, input, textarea, a, .ant-select")
        )
          void Window.ToggleMaximise();
      }}
    >
      {!isMac && (
        <Dropdown
          trigger={["click"]}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          menu={{
            onClick: () => setMenuOpen(false),
            items: [
              {
                type: "group",
                key: "file",
                label: t.menu.file,
                children: [
                  {
                    key: "open",
                    label: t.editor.withShortcut(
                      t.editor.openProject,
                      shortcutOf("openProject"),
                    ),
                    disabled: busy,
                    onClick: () => replaceProject(Editor.OpenProject),
                  },
                  {
                    key: "save",
                    label: t.editor.withShortcut(
                      t.editor.saveProject,
                      shortcutOf("saveProject"),
                    ),
                    disabled: busy || !p,
                    onClick: () => void save(false),
                  },
                  {
                    key: "export",
                    label: t.editor.withShortcut(
                      t.editor.exportSrt,
                      shortcutOf("exportSrt"),
                    ),
                    disabled: busy || !p,
                    onClick: () => void save(true),
                  },
                  {
                    key: "media",
                    label: t.common.importMedia,
                    disabled: busy || draftDirty,
                    onClick: () => void update(Editor.ImportVideo),
                  },
                  {
                    key: "srt",
                    label: t.common.importSrt,
                    disabled: busy,
                    onClick: () => replaceProject(Editor.ImportSRT),
                  },
                  {
                    key: "web",
                    label: t.editor.importWeb,
                    disabled: busy,
                    onClick: () => setImportTab("web"),
                  },
                  ...(showSample
                    ? [
                        {
                          key: "demo",
                          label: t.common.loadDemo,
                          disabled: busy,
                          onClick: () => replaceProject(Editor.LoadDemo),
                        },
                      ]
                    : []),
                ],
              },
              { type: "divider" },
              {
                type: "group",
                key: "edit",
                label: t.menu.edit,
                children: [
                  {
                    key: "undo",
                    label: t.editor.withShortcut(t.editor.undo, shortcutOf("undo")),
                    disabled: !canUndo,
                    onClick: () => void update(Editor.Undo),
                  },
                  {
                    key: "redo",
                    label: t.editor.withShortcut(t.editor.redo, shortcutOf("redo")),
                    disabled: !canRedo,
                    onClick: () => void update(Editor.Redo),
                  },
                  {
                    key: "shift",
                    label: t.editor.withShortcut(
                      t.shift.menu,
                      shortcutOf("shiftCues"),
                    ),
                    disabled: !canShift,
                    onClick: () => setShiftOpen(true),
                  },
                  {
                    key: "replace",
                    label: t.editor.withShortcut(
                      t.replace.menu,
                      shortcutOf("findReplace"),
                    ),
                    disabled: !canShift,
                    onClick: () => setReplaceOpen(true),
                  },
                  {
                    key: "settings",
                    label: t.editor.withShortcut(t.settings.title, settingsShortcut),
                    onClick: () => void run(Editor.OpenSettings),
                  },
                  {
                    key: "dictionary",
                    label: t.editor.withShortcut(
                      t.inspector.dictionaryOpen,
                      shortcutOf("dictionary"),
                    ),
                    onClick: () => void run(Editor.OpenDictionary),
                  },
                  {
                    key: "shortcuts",
                    label: t.editor.withShortcut(
                      t.shortcuts.title,
                      shortcutOf("shortcuts"),
                    ),
                    onClick: () => setShortcutsOpen(true),
                  },
                ],
              },
              ...(customChrome
                ? [
                    { type: "divider" as const },
                    {
                      type: "group" as const,
                      key: "window",
                      label: t.menu.window,
                      children: [
                        {
                          key: "minimise",
                          label: t.window.minimise,
                          onClick: () => void Window.Minimise(),
                        },
                        {
                          key: "maximise",
                          label: t.menu.toggleMaximise,
                          onClick: () => void Window.ToggleMaximise(),
                        },
                        {
                          key: "close",
                          label: t.window.close,
                          onClick: () => void Window.Close(),
                        },
                      ],
                    },
                  ]
                : []),
            ],
          }}
        >
          <Button
            type="text"
            size="small"
            className="icon-button"
            aria-label={t.menu.title}
            title={t.menu.title}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            icon={<IconMenu2 size={16} {...decorative} />}
          />
        </Dropdown>
      )}
      <div className="project-title">
        <strong>{name}</strong>
        {summary && <span>{summary}</span>}
      </div>
      <div className="toolbar-group">
        <IconButton
          type="text"
          size="small"
          className="icon-button"
          placement="bottom"
          label={t.editor.undo}
          tooltip={t.editor.withShortcut(t.editor.undo, shortcutOf("undo"))}
          disabled={!canUndo}
          onClick={() => void update(Editor.Undo)}
          icon={<IconArrowBackUp size={16} {...decorative} />}
        />
        <IconButton
          type="text"
          size="small"
          className="icon-button"
          placement="bottom"
          label={t.editor.redo}
          tooltip={t.editor.withShortcut(t.editor.redo, shortcutOf("redo"))}
          disabled={!canRedo}
          onClick={() => void update(Editor.Redo)}
          icon={<IconArrowForwardUp size={16} {...decorative} />}
        />
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <IconButton
          type="text"
          size="small"
          className="icon-button"
          placement="bottom"
          label={t.importer.title}
          tooltip={t.editor.withShortcut(t.importer.title, shortcutOf("import"))}
          onClick={() => setImportTab("local")}
          icon={<IconFileImport size={16} {...decorative} />}
        />
        {showSample && (
          <Button
            size="small"
            type="text"
            disabled={busy}
            onClick={() => replaceProject(Editor.LoadDemo)}
          >
            {t.common.loadDemo}
          </Button>
        )}
      </div>
      <div className="spacer" />
      <div className="toolbar-group">
        <IconButton
          type="text"
          size="small"
          className="icon-button"
          placement="bottom"
          label={t.editor.openProject}
          tooltip={t.editor.withShortcut(
            t.editor.openProject,
            shortcutOf("openProject"),
          )}
          disabled={busy}
          onClick={() => replaceProject(Editor.OpenProject)}
          icon={<IconFolderOpen size={16} {...decorative} />}
        />
        <IconButton
          type="text"
          size="small"
          className="icon-button"
          placement="bottom"
          label={t.editor.saveProject}
          tooltip={t.editor.withShortcut(
            t.editor.saveProject,
            shortcutOf("saveProject"),
          )}
          disabled={busy || !p}
          onClick={() => void save(false)}
          icon={
            <Badge
              dot={dirty || draftDirty}
              color="var(--accent)"
              offset={[-1, 2]}
            >
              <IconDeviceFloppy size={16} {...decorative} />
            </Badge>
          }
        />
        <Tooltip
          title={t.editor.withShortcut(t.editor.exportHint, shortcutOf("exportSrt"))}
        >
          <Button
            size="small"
            type="primary"
            disabled={busy || !p}
            onClick={() => void save(true)}
          >
            {t.editor.exportSrt}
          </Button>
        </Tooltip>
      </div>
      {customChrome && <WindowControls maximise />}
    </header>
  );
}
