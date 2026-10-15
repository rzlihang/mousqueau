import { tinykeys } from "tinykeys";

// Every keyboard shortcut of the editor in one table. Keys use tinykeys'
// syntax with KeyboardEvent.code names, so they follow key positions, not
// the characters a layout or ⌥ makes; $mod is ⌘ on macOS and Ctrl
// elsewhere.
//
// Scopes:
// - global: also while typing in a field, so these carry a modifier;
// - editor: only when no field, select or dialog has the focus.
// Menu commands also appear, with the same keys, in the macOS menu bar; a
// menu click reaches the editor as a "command" event.

// Read here rather than from useSettings, which needs a browser window.
const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

export type Scope = "global" | "editor";
export type Group = "file" | "playback" | "cues" | "speakers" | "timeline";

export const COMMANDS = [
  // File and app (macOS menu bar)
  { id: "openProject", keys: ["$mod+KeyO"], scope: "global", group: "file" },
  { id: "saveProject", keys: ["$mod+KeyS"], scope: "global", group: "file" },
  { id: "import", keys: ["$mod+KeyI"], scope: "global", group: "file" },
  { id: "exportSrt", keys: ["$mod+KeyE"], scope: "global", group: "file" },
  { id: "settings", keys: ["$mod+Comma"], scope: "global", group: "file" },
  {
    id: "dictionary",
    keys: ["$mod+Shift+KeyD"],
    scope: "global",
    group: "file",
  },
  { id: "shortcuts", keys: ["$mod+Slash"], scope: "global", group: "file" },
  // Undo and redo leave fields to their own text undo.
  { id: "undo", keys: ["$mod+KeyZ"], scope: "editor", group: "file" },
  {
    id: "redo",
    keys: isMac ? ["$mod+Shift+KeyZ"] : ["$mod+Shift+KeyZ", "Control+KeyY"],
    scope: "editor",
    group: "file",
  },
  // Playback
  { id: "playPause", keys: ["Space"], scope: "editor", group: "playback" },
  { id: "pause", keys: ["KeyK"], scope: "editor", group: "playback" },
  { id: "back2", keys: ["KeyJ"], scope: "editor", group: "playback" },
  { id: "forward2", keys: ["KeyL"], scope: "editor", group: "playback" },
  { id: "back10", keys: ["Shift+KeyJ"], scope: "editor", group: "playback" },
  {
    id: "forward10",
    keys: ["Shift+KeyL"],
    scope: "editor",
    group: "playback",
  },
  { id: "back1", keys: ["ArrowLeft"], scope: "editor", group: "playback" },
  { id: "forward1", keys: ["ArrowRight"], scope: "editor", group: "playback" },
  { id: "slower", keys: ["BracketLeft"], scope: "editor", group: "playback" },
  { id: "faster", keys: ["BracketRight"], scope: "editor", group: "playback" },
  { id: "replay", keys: ["KeyR"], scope: "editor", group: "playback" },
  // Cues
  { id: "previousCue", keys: ["ArrowUp"], scope: "editor", group: "cues" },
  { id: "nextCue", keys: ["ArrowDown"], scope: "editor", group: "cues" },
  { id: "editText", keys: ["Enter"], scope: "editor", group: "cues" },
  { id: "applyEdit", keys: ["$mod+Enter"], scope: "global", group: "cues" },
  { id: "setStart", keys: ["KeyI"], scope: "editor", group: "cues" },
  { id: "setEnd", keys: ["KeyO"], scope: "editor", group: "cues" },
  { id: "split", keys: ["$mod+KeyK"], scope: "global", group: "cues" },
  { id: "mergeNext", keys: ["$mod+KeyJ"], scope: "global", group: "cues" },
  {
    id: "mergePrevious",
    keys: ["$mod+Shift+KeyJ"],
    scope: "global",
    group: "cues",
  },
  { id: "toggleReview", keys: ["$mod+KeyR"], scope: "global", group: "cues" },
  // Speakers: n is the speaker's place in the speakers tab; 0 is none.
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => ({
    id: `speaker${n}` as const,
    keys: [`Control+Alt+Digit${n}`],
    scope: "global" as const,
    group: "speakers" as const,
  })),
  // Timeline
  { id: "zoomIn", keys: ["Equal"], scope: "editor", group: "timeline" },
  { id: "zoomOut", keys: ["Minus"], scope: "editor", group: "timeline" },
  { id: "zoomToCue", keys: ["KeyZ"], scope: "editor", group: "timeline" },
] as const satisfies readonly {
  id: string;
  keys: readonly string[];
  scope: Scope;
  group: Group;
}[];

export type CommandId = (typeof COMMANDS)[number]["id"];
export type Command = (typeof COMMANDS)[number];

// Commands the macOS menu bar carries; a click there sends the same id.
export const MENU_COMMANDS: readonly CommandId[] = [
  "openProject",
  "saveProject",
  "import",
  "exportSrt",
  "settings",
  "dictionary",
  "shortcuts",
];

const FIELD =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), .ant-select";
const OVERLAY = ".ant-modal, .ant-popover, .ant-dropdown, .ant-picker-dropdown";
// Controls that use these keys themselves.
const OWN_KEYS: Partial<Record<string, string>> = {
  Enter: "button, a[href], [role='button'], [role='tab'], [role='menuitem']",
  ArrowLeft: "[role='slider'], [role='separator'], [role='tab']",
  ArrowRight: "[role='slider'], [role='separator'], [role='tab']",
  ArrowUp: "[role='slider'], [role='separator'], [role='listbox']",
  ArrowDown: "[role='slider'], [role='separator'], [role='listbox']",
};

type Target = { closest(selector: string): unknown } | null;

// Whether a press of code on target should run a command in scope.
export function inScope(scope: Scope, code: string, target: Target): boolean {
  if (target?.closest(OVERLAY)) return false;
  if (scope === "global") return true;
  if (target?.closest(FIELD)) return false;
  const own = OWN_KEYS[code];
  return !(own && target?.closest(own));
}

// A handler returns false when it did nothing; the key then keeps its
// usual effect.
export type Handlers = Partial<Record<CommandId, () => unknown>>;

// The command a key last ran, so a menu click for the same press is not
// run twice.
export const lastRun = { id: "", at: 0 };

// Subscribes the window to every command; handlers are read at each press,
// so the caller can pass a ref that it updates on render.
export function bindKeymap(handlers: { current: Handlers }): () => void {
  const map: Record<string, (e: KeyboardEvent) => void> = {};
  for (const command of COMMANDS) {
    for (const key of command.keys) {
      map[key] = (e) => {
        const run = handlers.current[command.id];
        const target = e.target instanceof Element ? e.target : null;
        if (!run || !inScope(command.scope, e.code, target)) return;
        if (e.repeat && !REPEATS.has(command.id)) {
          e.preventDefault();
          return;
        }
        if (run() === false) return;
        e.preventDefault();
        lastRun.id = command.id;
        lastRun.at = performance.now();
      };
    }
  }
  return tinykeys(window, map, { ignore: () => false });
}

// Holding these keeps going; the rest run once per press.
const REPEATS = new Set<CommandId>([
  "back1",
  "forward1",
  "back2",
  "forward2",
  "back10",
  "forward10",
  "previousCue",
  "nextCue",
  "zoomIn",
  "zoomOut",
]);

const MAC_MODS: Record<string, string> = {
  $mod: "⌘",
  Meta: "⌘",
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
};
const PC_MODS: Record<string, string> = {
  $mod: "Ctrl",
  Meta: "Win",
  Control: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
};
const KEY_NAMES: Record<string, string> = {
  Space: "Space",
  Enter: isMac ? "↩" : "Enter",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  BracketLeft: "[",
  BracketRight: "]",
  Equal: "=",
  Minus: "−",
  Comma: ",",
  Slash: "/",
};

// How a key is written for people: ⌃⌥1 on macOS, Ctrl+Alt+1 elsewhere.
export function keyLabel(key: string): string {
  const parts = key.split("+");
  const code = parts.pop() ?? "";
  const name =
    KEY_NAMES[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "");
  // macOS orders modifiers ⌃⌥⇧⌘; Windows and Linux write Ctrl+Alt+Shift.
  const order = isMac
    ? ["Control", "Alt", "Shift", "$mod", "Meta"]
    : ["$mod", "Control", "Alt", "Shift", "Meta"];
  const mods = parts.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return isMac
    ? mods.map((m) => MAC_MODS[m] ?? m).join("") + name
    : [...mods.map((m) => PC_MODS[m] ?? m), name].join("+");
}

export function shortcutOf(id: CommandId): string {
  const command = COMMANDS.find((c) => c.id === id);
  return command ? keyLabel(command.keys[0]) : "";
}
